import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canEdit, context, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { loadLunches, lunchesMissing } from '@/lib/api/lunches'
import { loadPeople, PEOPLE_MISSING, PeopleMissingError, peopleSchemaMissing } from '@/lib/api/people'
import {
  canEditCarePerson,
  coverageDateBlock,
  coverageView,
  COVERAGE_FUTURE_DAYS,
} from '@/lib/coverage/schedule'
import { LUNCH_DAY_LIMIT } from '@/lib/lunch/lunch'
import { todayISO } from '@/lib/schedule/dates'
import { isoDateSchema } from '@/lib/validation'

type Context = { params: Promise<{ id: string }> }

const writeSchema = z.object({
  personId: z.uuid('El cuidador no es válido'),
  assigned: z.boolean('Indica si el almuerzo queda asignado'),
  days: z
    .array(isoDateSchema)
    .min(1, 'Elige al menos un día')
    .max(LUNCH_DAY_LIMIT, 'Son demasiados días de una vez'),
})

export async function PUT(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes editar el horario', 403)

    const from = new URL(request.url).searchParams.get('from')
    const body = await parseBody(request, writeSchema)
    if ('response' in body) return body.response

    const today = todayISO()
    const blocked = body.data.days.map((day) => coverageDateBlock(day, today)).find((block) => block != null)
    if (blocked === 'future') {
      return jsonError(`Solo puedes marcar hasta ${COVERAGE_FUTURE_DAYS} días después de hoy`, 400)
    }
    if (blocked === 'past') return jsonError('Esa fecha queda fuera del historial', 400)

    try {
      const people = await loadPeople(session.supabase, id)
      const person = people.find((entry) => entry.id === body.data.personId)
      if (!person) return jsonError('No encontramos a esa persona', 404)
      if (!canEditCarePerson(access.role, session.user.id, person)) {
        return jsonError('Solo puedes editar tu propio horario', 403)
      }
      if (body.data.assigned && !person.assignable) return jsonError('Esa persona ya no es cuidadora', 400)

      const saved = await session.supabase.rpc('set_care_lunch', {
        p_patient_id: id,
        p_person_id: person.id,
        p_assigned: body.data.assigned,
        p_days: body.data.days,
      })
      if (peopleSchemaMissing(saved.error) || lunchesMissing(saved.error)) {
        return jsonError('Los almuerzos todavía no están listos. Falta aplicar la migración en la base de datos.', 503)
      }
      if (saved.error) {
        const message = saved.error.message ?? ''
        if (message.includes('No puedes editar')) return jsonError('No puedes editar el horario', 403)
        if (message.includes('Solo puedes editar tu propio')) {
          return jsonError('Solo puedes editar tu propio horario', 403)
        }
        if (message.includes('Solo puedes asignar')) return jsonError('Solo puedes asignar a un cuidador', 400)
        if (message.includes('ventana') || message.includes('fuera')) {
          return jsonError(`Solo puedes marcar hasta ${COVERAGE_FUTURE_DAYS} días después de hoy`, 400)
        }
        if (message.includes('máximo dos') || message.includes('maximo dos')) {
          return jsonError('Como máximo dos personas a cargo del almuerzo ese día', 400)
        }
        throw saved.error
      }

      const names = new Map(people.map((entry) => [entry.id, entry.name]))
      const windowFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null
      const visible = coverageView(today, windowFrom)
      const lunches = await loadLunches(session.supabase, id, visible.from, visible.to, names)
      if (lunches == null) {
        return jsonError('Los almuerzos todavía no están listos. Falta aplicar la migración en la base de datos.', 503)
      }
      return NextResponse.json({ role: access.role, lunches })
    } catch (error) {
      if (error instanceof PeopleMissingError) return jsonError(PEOPLE_MISSING, 503)
      throw error
    }
  })
}
