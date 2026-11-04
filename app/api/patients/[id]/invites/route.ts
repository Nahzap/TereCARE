import { NextResponse } from 'next/server'
import { context, isOwner, isUniqueViolation, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { asRows, mapInvite, profileEmail } from '@/lib/api/map'
import { prepareCaregiver } from '@/lib/api/people-admin'
import { cleanPhone, inviteDraftSchema } from '@/lib/coverage/people'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) return jsonError('Solo el dueño puede invitar', 403)

    const body = await parseBody(request, inviteDraftSchema)
    if ('response' in body) return body.response
    const email = body.data.email.trim().toLowerCase()
    const phone = cleanPhone(body.data.phone)
    const name = body.data.name?.trim() ?? ''

    const members = await session.supabase
      .from('patient_members')
      .select('profiles!patient_members_user_id_fkey(email)')
      .eq('patient_id', id)
    if (members.error) throw members.error
    const already = asRows<{ profiles: unknown }>(members.data).some(
      (row) => profileEmail(row.profiles) === email,
    )
    if (already) return jsonError('Esa persona ya tiene acceso', 409)

    let createdId: string | null = null
    let phoneSaved = true
    if (body.data.role === 'caregiver') {
      const pending = await session.supabase
        .from('patient_invites')
        .select('id')
        .eq('patient_id', id)
        .eq('email', email)
        .is('accepted_at', null)
        .maybeSingle()
      if (pending.error) throw pending.error
      if (pending.data) return jsonError('Ese correo ya está invitado', 409)

      const prepared = await prepareCaregiver(session.supabase, id, session.user.id, { name, email, phone })
      if ('error' in prepared) return jsonError(prepared.error, prepared.status)
      createdId = prepared.createdId
      phoneSaved = prepared.phoneSaved
    }

    const inserted = await session.supabase
      .from('patient_invites')
      .insert({
        patient_id: id,
        email,
        role: body.data.role,
        invited_by: session.user.id,
      })
      .select('id, email, role, created_at')
      .maybeSingle()

    if (inserted.error) {
      if (createdId) {
        await session.supabase.from('care_people').delete().eq('id', createdId).eq('patient_id', id)
      }
      if (isUniqueViolation(inserted.error)) {
        return jsonError('Ese correo ya está invitado', 409)
      }
      throw inserted.error
    }
    if (!inserted.data) throw new Error('No se pudo crear la invitación')
    return NextResponse.json(
      { ...mapInvite(inserted.data, name ? { name, phone: phoneSaved ? phone : null } : null), phoneSaved },
      { status: 201 },
    )
  })
}
