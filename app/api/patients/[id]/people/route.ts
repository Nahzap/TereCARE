import { NextResponse } from 'next/server'
import { context, isOwner, isUniqueViolation, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { inviteCaregiver, peopleWithHours } from '@/lib/api/people-admin'
import { loadMembers, PEOPLE_MISSING, PeopleMissingError, peopleSchemaMissing } from '@/lib/api/people'
import { cleanEmail, personCreateSchema } from '@/lib/coverage/people'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    try {
      return NextResponse.json({ role: access.role, people: await peopleWithHours(session.supabase, id) })
    } catch (error) {
      if (error instanceof PeopleMissingError) return jsonError(PEOPLE_MISSING, 503)
      throw error
    }
  })
}

export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) return jsonError('Solo el dueño puede agregar personas', 403)

    const body = await parseBody(request, personCreateSchema)
    if ('response' in body) return body.response
    const email = cleanEmail(body.data.email)

    if (email) {
      const members = await loadMembers(session.supabase, id)
      if (members.some((member) => member.email === email)) {
        return jsonError('Esa persona ya entró con ese correo. Ya aparece en el horario.', 409)
      }
    }

    const inserted = await session.supabase
      .from('care_people')
      .insert({ patient_id: id, display_name: body.data.name, email, created_by: session.user.id })
      .select('id')
      .maybeSingle()
    if (peopleSchemaMissing(inserted.error)) return jsonError(PEOPLE_MISSING, 503)
    if (isUniqueViolation(inserted.error)) return jsonError('Ya hay una persona con ese correo', 409)
    if (inserted.error) throw inserted.error
    if (!inserted.data) throw new Error('No se pudo agregar a la persona')

    if (email) await inviteCaregiver(session.supabase, id, email, session.user.id)
    return NextResponse.json({ id: inserted.data.id, invited: email != null }, { status: 201 })
  })
}
