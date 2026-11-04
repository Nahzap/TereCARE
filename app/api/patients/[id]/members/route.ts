import { NextResponse } from 'next/server'
import { grantDecision } from '@/lib/access/grants'
import { grantBodySchema } from '@/lib/access/schema'
import { context, isOwner, isUniqueViolation, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { asRows, compareMembers, mapInvite, mapMember } from '@/lib/api/map'
import { loadPeople, PeopleMissingError } from '@/lib/api/people'
import type { Invite } from '@/lib/domain'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const memberResult = await session.supabase
      .from('patient_members')
      .select('user_id, role, profiles!patient_members_user_id_fkey(email, full_name)')
      .eq('patient_id', id)
    if (memberResult.error) throw memberResult.error

    const members = asRows<{ user_id: string; role: string; profiles: unknown }>(memberResult.data)
      .map(mapMember)
      .sort(compareMembers)

    let invites: Invite[] = []
    if (isOwner(access.role)) {
      const inviteResult = await session.supabase
        .from('patient_invites')
        .select('id, email, role, created_at')
        .eq('patient_id', id)
        .is('accepted_at', null)
        .order('created_at', { ascending: true })
      if (inviteResult.error) throw inviteResult.error
      let people: Awaited<ReturnType<typeof loadPeople>> = []
      try {
        people = await loadPeople(session.supabase, id)
      } catch (error) {
        if (!(error instanceof PeopleMissingError)) throw error
      }
      const byEmail = new Map(people.flatMap((person) => (person.email ? [[person.email, person] as const] : [])))
      invites = asRows<{ id: string; email: string; role: string; created_at: string }>(inviteResult.data).map((row) =>
        mapInvite(row, byEmail.get(row.email.trim().toLowerCase())),
      )
    }

    return NextResponse.json({ members, invites })
  })
}

export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const body = await parseBody(request, grantBodySchema)
    if ('response' in body) return body.response

    const decision = grantDecision({
      actorRole: access.role,
      actorId: session.user.id,
      targetUserId: body.data.userId,
      role: body.data.role,
    })
    if ('code' in decision) return jsonError(decision.message, decision.code === 'forbidden' ? 403 : 400)

    const inserted = await session.supabase
      .from('patient_members')
      .insert({
        patient_id: id,
        user_id: body.data.userId,
        role: decision.role,
      })
      .select('user_id, role, profiles!patient_members_user_id_fkey(email, full_name)')
      .maybeSingle()
    if (isUniqueViolation(inserted.error)) return jsonError('Esa cuenta ya está vinculada a la ficha', 409)
    if (inserted.error) throw inserted.error
    if (!inserted.data) throw new Error('No se pudo vincular la cuenta')

    return NextResponse.json(
      mapMember(inserted.data as { user_id: string; role: string; profiles: unknown }),
      { status: 201 },
    )
  })
}
