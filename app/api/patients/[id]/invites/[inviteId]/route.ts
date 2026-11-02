import { NextResponse } from 'next/server'
import { context, isOwner, jsonError, requireRole, respond } from '@/lib/api/guard'

type Context = { params: Promise<{ id: string; inviteId: string }> }

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
