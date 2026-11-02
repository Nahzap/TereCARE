import { NextResponse } from 'next/server'
import { roleChangeDecision } from '@/lib/access/grants'
import { roleBodySchema } from '@/lib/access/schema'
import { asRole, context, isOwner, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { mapMember } from '@/lib/api/map'

type Context = { params: Promise<{ id: string; userId: string }> }

export async function DELETE(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id, userId } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) {
      return jsonError('Solo el dueño puede quitar integrantes', 403)
    }

    const target = await session.supabase
      .from('patient_members')
      .select('role')
      .eq('patient_id', id)
      .eq('user_id', userId)
      .maybeSingle()
    if (target.error) throw target.error
    if (!target.data) return jsonError('No encontramos a esa persona', 404)
    if (target.data.role === 'owner') return jsonError('No puedes quitar al dueño', 403)

    const removed = await session.supabase
      .from('patient_members')
      .delete()
      .eq('patient_id', id)
      .eq('user_id', userId)
      .neq('role', 'owner')
      .select('user_id')
    if (removed.error) throw removed.error
    if (!removed.data?.length) return jsonError('No encontramos a esa persona', 404)
    return NextResponse.json({ ok: true })
  })
}

export async function PATCH(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id, userId } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const body = await parseBody(request, roleBodySchema)
    if ('response' in body) return body.response

    const target = await session.supabase
      .from('patient_members')
      .select('role')
      .eq('patient_id', id)
      .eq('user_id', userId)
      .maybeSingle()
    if (target.error) throw target.error

    const decision = roleChangeDecision({
      actorRole: access.role,
      targetRole: asRole(target.data?.role),
      role: body.data.role,
    })
    if ('code' in decision) {
      const status = !target.data ? 404 : decision.code === 'forbidden' ? 403 : 400
      return jsonError(decision.message, status)
    }

    const updated = await session.supabase
      .from('patient_members')
      .update({ role: decision.role })
      .eq('patient_id', id)
      .eq('user_id', userId)
      .neq('role', 'owner')
      .select('user_id, role, profiles!patient_members_user_id_fkey(email, full_name)')
      .maybeSingle()
    if (updated.error) throw updated.error
    if (!updated.data) return jsonError('No encontramos a esa persona en la ficha', 404)

    return NextResponse.json(mapMember(updated.data as { user_id: string; role: string; profiles: unknown }))
  })
}
