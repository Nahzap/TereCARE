import { NextResponse } from 'next/server'
import { canEdit, context, jsonError, parseBody, requireRole, respond, type AppClient } from '@/lib/api/guard'
import { asRows, normalizeDate } from '@/lib/api/map'
import { loadPeople, PEOPLE_MISSING, PeopleMissingError, peopleSchemaMissing } from '@/lib/api/people'
import type { CarePerson } from '@/lib/coverage/people'
import { coverageWriteSchema } from '@/lib/coverage/schema'
import {
  coverageDateBlock,
  coverageView,
  dedupeSlots,
  type CoveragePayload,
  type CoverageSlot,
} from '@/lib/coverage/schedule'
import { todayISO } from '@/lib/schedule/dates'

type Context = { params: Promise<{ id: string }> }

type CoverageRow = {
  id: string
  person_id: string
  covered_on: string
  hour: number
}

const PAGE_SIZE = 1000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function requestedStart(
  request: Request,
): { ok: true; from: string | null } | { ok: false; response: NextResponse } {
  const from = new URL(request.url).searchParams.get('from')
  if (from && !ISO_DATE.test(from)) {
    return { ok: false, response: jsonError('Usa una fecha en formato AAAA-MM-DD', 400) }
  }
  return { ok: true, from: from || null }
}

function mapSlot(row: CoverageRow, names: Map<string, string>): CoverageSlot {
  return {
    personId: row.person_id,
    coveredOn: normalizeDate(row.covered_on) ?? row.covered_on,
    hour: row.hour,
    caregiverName: names.get(row.person_id) ?? 'Cuidador',
  }
}

async function loadCoverage(
  supabase: AppClient,
  patientId: string,
  role: CoveragePayload['role'],
  start: string | null,
  known?: CarePerson[],
): Promise<CoveragePayload> {
  const visible = coverageView(todayISO(), start)
  const people = known ?? (await loadPeople(supabase, patientId))
  const names = new Map(people.map((person) => [person.id, person.name]))
  const seen = new Set<string>()
  const slots: CoverageSlot[] = []

  for (let page = 0; page < 10; page += 1) {
    const { data, error } = await supabase
      .from('care_coverages')
      .select('id, person_id, covered_on, hour')
      .eq('patient_id', patientId)
      .gte('covered_on', visible.from)
      .lte('covered_on', visible.to)
      .order('covered_on', { ascending: true })
      .order('hour', { ascending: true })
      .order('person_id', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (peopleSchemaMissing(error)) throw new PeopleMissingError()
    if (error) throw error

    const batch = asRows<CoverageRow>(data)
    if (batch.length === 0 || (batch[0] && seen.has(batch[0].id))) break
    for (const row of batch) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      slots.push(mapSlot(row, names))
    }
    if (batch.length < PAGE_SIZE) break
  }

  return { role, ...visible, people, slots }
}

export async function GET(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    const start = requestedStart(request)
    if (!start.ok) return start.response

    try {
      return NextResponse.json(await loadCoverage(session.supabase, id, access.role, start.from))
    } catch (error) {
      if (error instanceof PeopleMissingError) return jsonError(PEOPLE_MISSING, 503)
      throw error
    }
  })
}

export async function PUT(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes editar el horario', 403)
    const start = requestedStart(request)
    if (!start.ok) return start.response

    const body = await parseBody(request, coverageWriteSchema)
    if ('response' in body) return body.response

    const slots = dedupeSlots(body.data.slots)
    const today = todayISO()
    const blocked = slots
      .map((slot) => coverageDateBlock(slot.coveredOn, today))
      .find((block) => block != null)
    if (blocked === 'future') return jsonError('Solo puedes marcar hasta 15 días después de hoy', 400)
    if (blocked === 'past') return jsonError('Esa fecha queda fuera del historial', 400)

    try {
      const people = await loadPeople(session.supabase, id)
      const person = people.find((entry) => entry.id === body.data.personId)
      if (!person) return jsonError('No encontramos a esa persona', 404)
      if (body.data.assigned && !person.assignable) return jsonError('Esa persona ya no es cuidadora', 400)

      const saved = await session.supabase.rpc('set_care_coverage', {
        p_patient_id: id,
        p_person_id: person.id,
        p_assigned: body.data.assigned,
        p_slots: slots,
      })
      if (peopleSchemaMissing(saved.error)) return jsonError(PEOPLE_MISSING, 503)
      if (saved.error) {
        const message = saved.error.message ?? ''
        if (message.includes('No puedes editar')) return jsonError('No puedes editar el horario', 403)
        if (message.includes('Solo puedes asignar')) return jsonError('Solo puedes asignar a un cuidador', 400)
        if (message.includes('ventana')) {
          return jsonError('Solo puedes marcar hasta 15 días después de hoy', 400)
        }
        if (message.includes('hora')) return jsonError('La hora no es válida', 400)
        throw saved.error
      }

      return NextResponse.json(await loadCoverage(session.supabase, id, access.role, start.from, people))
    } catch (error) {
      if (error instanceof PeopleMissingError) return jsonError(PEOPLE_MISSING, 503)
      throw error
    }
  })
}
