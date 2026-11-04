import { NextResponse } from 'next/server'
import { context, isOwner, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { inviteCaregiver, peopleWithHours, savePerson } from '@/lib/api/people-admin'
import { loadMembers, PEOPLE_MISSING, PeopleMissingError } from '@/lib/api/people'
import { cleanEmail, cleanPhone, personCreateSchema } from '@/lib/coverage/people'

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
    const phone = cleanPhone(body.data.phone)

    if (email) {
      const members = await loadMembers(session.supabase, id)
      if (members.some((member) => member.email === email)) {
        return jsonError('Esa persona ya entró con ese correo. Ya aparece en el horario.', 409)
      }
    }

    const saved = await savePerson(session.supabase, {
      mode: 'insert',
      patientId: id,
      actorId: session.user.id,
      name: body.data.name,
      email,
      phone,
    })
    if ('error' in saved) return jsonError(saved.error, saved.status)
    if (!saved.createdId) throw new Error('No se pudo agregar a la persona')

    if (email) await inviteCaregiver(session.supabase, id, email, session.user.id)
    return NextResponse.json({ id: saved.createdId, invited: email != null, phoneSaved: saved.phoneSaved }, { status: 201 })
  })
}
