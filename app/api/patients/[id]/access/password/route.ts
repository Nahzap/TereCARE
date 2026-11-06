import { NextResponse } from 'next/server'
import { ownerAccessPasswordSchema } from '@/lib/auth/access'
import { accountError, passwordError } from '@/lib/auth/password'
import { context, isOwner, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { createAdminClient } from '@/lib/supabase/admin'

type Context = { params: Promise<{ id: string }> }

type MemberRow = {
  user_id: string
  role: string
  profiles: { email?: string | null } | { email?: string | null }[] | null
}

async function findAuthUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const normalized = email.trim().toLowerCase()
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (listed.error) throw listed.error
    const match = listed.data.users.find((user) => (user.email ?? '').trim().toLowerCase() === normalized)
    if (match) return match.id
    if (listed.data.users.length < 200) return null
  }
  return null
}

function profileEmail(row: MemberRow) {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  return (profile?.email ?? '').trim().toLowerCase()
}

export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id: patientId } = await params
    const access = await requireRole(session.supabase, session.user.id, patientId)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) {
      return jsonError('Solo el dueño puede definir contraseñas de acceso', 403)
    }

    const body = await parseBody(request, ownerAccessPasswordSchema)
    if ('response' in body) return body.response

    const strength = passwordError(body.data.nextPassword, 'La contraseña')
    if (strength) return jsonError(strength, 400)

    const email = body.data.email

    const members = await session.supabase
      .from('patient_members')
      .select('user_id, role, profiles!patient_members_user_id_fkey(email)')
      .eq('patient_id', patientId)
    if (members.error) throw members.error

    const matchedMember = ((members.data ?? []) as MemberRow[]).find((row) => profileEmail(row) === email)
    if (matchedMember?.role === 'owner') {
      return jsonError('No puedes cambiar la contraseña del dueño desde aquí', 403)
    }

    let allowed = Boolean(matchedMember)
    if (!allowed) {
      const invite = await session.supabase
        .from('patient_invites')
        .select('id')
        .eq('patient_id', patientId)
        .ilike('email', email)
        .is('accepted_at', null)
        .maybeSingle()
      if (invite.error) throw invite.error
      allowed = Boolean(invite.data)
    }

    if (!allowed) {
      return jsonError('Ese correo no es miembro ni tiene invitación pendiente en esta ficha', 404)
    }

    let admin
    try {
      admin = createAdminClient()
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Falta la clave de servicio de Supabase', 503)
    }

    const existingId = matchedMember?.user_id ?? (await findAuthUserIdByEmail(admin, email))
    if (existingId) {
      const updated = await admin.auth.admin.updateUserById(existingId, {
        password: body.data.nextPassword,
        email_confirm: true,
      })
      if (updated.error) {
        return jsonError(accountError(updated.error.message) || updated.error.message, 400)
      }
      console.info('owner-password-set', {
        patientId,
        by: session.user.id,
        target: existingId,
        mode: 'update',
      })
      return NextResponse.json({ ok: true, created: false })
    }

    const created = await admin.auth.admin.createUser({
      email,
      password: body.data.nextPassword,
      email_confirm: true,
    })
    if (created.error) {
      return jsonError(accountError(created.error.message) || created.error.message, 400)
    }

    console.info('owner-password-set', {
      patientId,
      by: session.user.id,
      target: created.data.user?.id ?? null,
      mode: 'create',
    })
    return NextResponse.json({ ok: true, created: true })
  })
}
