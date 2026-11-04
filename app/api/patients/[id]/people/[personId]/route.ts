import { NextResponse } from 'next/server'
import { context, isOwner, isUniqueViolation, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { loadMembers, loadPeople, PEOPLE_MISSING, PeopleMissingError, phoneColumnMissing, peopleSchemaMissing } from '@/lib/api/people'
import { dropPendingInvite, inviteCaregiver } from '@/lib/api/people-admin'
import { cleanEmail, cleanPhone, personUpdateSchema } from '@/lib/coverage/people'

type Context = { params: Promise<{ id: string; personId: string }> }

export async function PATCH(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id, personId } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) return jsonError('Solo el dueño puede editar personas', 403)

    const body = await parseBody(request, personUpdateSchema)
    if ('response' in body) return body.response

    try {
      const person = (await loadPeople(session.supabase, id)).find((entry) => entry.id === personId)
      if (!person) return jsonError('No encontramos a esa persona', 404)

      const changes: { display_name?: string; email?: string | null; phone?: string | null } = {}
      if (body.data.name !== undefined) changes.display_name = body.data.name
      if (body.data.phone !== undefined) changes.phone = cleanPhone(body.data.phone)
      const email = body.data.email === undefined ? undefined : cleanEmail(body.data.email)
      if (email !== undefined) {
        if (person.userId) return jsonError('Esta persona ya entró con su cuenta; su correo no se cambia aquí', 400)
        if (email) {
          const members = await loadMembers(session.supabase, id)
          if (members.some((member) => member.email === email)) {
            return jsonError('Ese correo ya tiene cuenta en la ficha. Usa Fusionar para unir a las dos personas.', 409)
          }
        }
        changes.email = email
      }

      let phoneSaved = true
      let updated = await session.supabase.from('care_people').update(changes).eq('id', personId).eq('patient_id', id)
      if (phoneColumnMissing(updated.error)) {
        phoneSaved = changes.phone == null
        const rest = { ...changes }
        delete rest.phone
        updated = await session.supabase.from('care_people').update(rest).eq('id', personId).eq('patient_id', id)
      }
      if (peopleSchemaMissing(updated.error)) return jsonError(PEOPLE_MISSING, 503)
      if (isUniqueViolation(updated.error)) return jsonError('Ya hay una persona con ese correo', 409)
      if (updated.error?.code === '23514' && (updated.error.message ?? '').includes('phone')) {
        return jsonError('Escribe un teléfono válido', 400)
      }
      if (updated.error) throw updated.error

      if (email !== undefined && email !== person.email) {
        if (person.email) await dropPendingInvite(session.supabase, id, person.email)
        if (email) await inviteCaregiver(session.supabase, id, email, session.user.id)
      }
      return NextResponse.json({ ok: true, phoneSaved })
    } catch (error) {
      if (error instanceof PeopleMissingError) return jsonError(PEOPLE_MISSING, 503)
      throw error
    }
  })
}

export async function DELETE(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id, personId } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) return jsonError('Solo el dueño puede quitar personas', 403)

    try {
      const person = (await loadPeople(session.supabase, id)).find((entry) => entry.id === personId)
      if (!person) return jsonError('No encontramos a esa persona', 404)
      if (person.userId) return jsonError('Esta persona ya tiene cuenta. Quita su acceso desde Acceso.', 400)

      const expenses = await session.supabase
        .from('care_expenses')
        .select('id', { count: 'exact', head: true })
        .eq('person_id', personId)
      if (!expenses.error && (expenses.count ?? 0) > 0) {
        return jsonError('Esta persona tiene gastos registrados. Cámbiales el comprador antes de quitarla.', 409)
      }

      const removed = await session.supabase.from('care_people').delete().eq('id', personId).eq('patient_id', id)
      if (removed.error) throw removed.error
      if (person.email) await dropPendingInvite(session.supabase, id, person.email)
      return NextResponse.json({ ok: true })
    } catch (error) {
      if (error instanceof PeopleMissingError) return jsonError(PEOPLE_MISSING, 503)
      throw error
    }
  })
}
