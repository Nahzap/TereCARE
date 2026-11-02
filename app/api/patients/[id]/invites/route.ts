import { NextResponse } from 'next/server'
import { inviteBodySchema } from '@/lib/validation'
import { context, isOwner, isUniqueViolation, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { asRows, mapInvite, profileEmail } from '@/lib/api/map'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) return jsonError('Solo el dueño puede invitar', 403)

    const body = await parseBody(request, inviteBodySchema)
    if ('response' in body) return body.response
    const email = body.data.email.trim().toLowerCase()

    const members = await session.supabase
      .from('patient_members')
      .select('profiles!patient_members_user_id_fkey(email)')
      .eq('patient_id', id)
    if (members.error) throw members.error
    const already = asRows<{ profiles: unknown }>(members.data).some(
      (row) => profileEmail(row.profiles) === email,
    )
    if (already) return jsonError('Esa persona ya tiene acceso', 409)

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
      if (isUniqueViolation(inserted.error)) {
        return jsonError('Ese correo ya está invitado', 409)
      }
      throw inserted.error
    }
    if (!inserted.data) throw new Error('No se pudo crear la invitación')
    return NextResponse.json(mapInvite(inserted.data), { status: 201 })
  })
}
