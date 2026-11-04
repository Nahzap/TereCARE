import { NextResponse } from 'next/server'
import { context, isOwner, isUniqueViolation, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { prepareCaregiver } from '@/lib/api/people-admin'
import { cleanPhone, inviteProfileSchema } from '@/lib/coverage/people'

type Context = { params: Promise<{ id: string; inviteId: string }> }

export async function PATCH(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id, inviteId } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) return jsonError('Solo el dueño puede editar invitaciones', 403)

    const body = await parseBody(request, inviteProfileSchema)
    if ('response' in body) return body.response
    const email = body.data.email.trim().toLowerCase()
    const phone = cleanPhone(body.data.phone)
    const name = body.data.name?.trim() ?? ''

    const found = await session.supabase
      .from('patient_invites')
      .select('id, email, role')
      .eq('id', inviteId)
      .eq('patient_id', id)
      .is('accepted_at', null)
      .maybeSingle()
    if (found.error) throw found.error
    if (!found.data) return jsonError('No encontramos esa invitación', 404)
    if (found.data.role === 'caregiver' && !name) return jsonError('Escribe el nombre del cuidador', 400)

    const previousEmail = found.data.email.trim().toLowerCase()
    if (email !== previousEmail) {
      const moved = await session.supabase
        .from('patient_invites')
        .update({ email })
        .eq('id', inviteId)
        .eq('patient_id', id)
        .is('accepted_at', null)
        .select('id')
      if (isUniqueViolation(moved.error)) return jsonError('Ese correo ya está invitado', 409)
      if (moved.error) throw moved.error
      if (!moved.data?.length) return jsonError('No encontramos esa invitación', 404)
    }

    if (found.data.role !== 'caregiver') return NextResponse.json({ ok: true, phoneSaved: true })

    const prepared = await prepareCaregiver(session.supabase, id, session.user.id, {
      name,
      email,
      phone,
      fromEmail: previousEmail,
    })
    if ('error' in prepared) {
      if (email !== previousEmail) {
        await session.supabase.from('patient_invites').update({ email: previousEmail }).eq('id', inviteId).eq('patient_id', id)
      }
      return jsonError(prepared.error, prepared.status)
    }
    return NextResponse.json({ ok: true, phoneSaved: prepared.phoneSaved })
  })
}

export async function DELETE(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id, inviteId } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) {
      return jsonError('Solo el dueño puede cancelar invitaciones', 403)
    }

    const removed = await session.supabase
      .from('patient_invites')
      .delete()
      .eq('id', inviteId)
      .eq('patient_id', id)
      .select('id')
    if (removed.error) throw removed.error
    if (!removed.data?.length) return jsonError('No encontramos esa invitación', 404)
    return NextResponse.json({ ok: true })
  })
}
