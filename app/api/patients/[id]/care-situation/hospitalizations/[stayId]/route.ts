import { NextResponse } from 'next/server'
import { context, isOwner, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { loadSituation, SITUATION_MISSING, SituationMissingError, situationMissing } from '@/lib/api/care-situation'
import { stayConflict, staySchema } from '@/lib/care/situation'

type Context = { params: Promise<{ id: string; stayId: string }> }

function stayError(error: { message?: string } | null) {
  const message = error?.message ?? ''
  if (message.includes('cruza') || message.includes('anterior') || message.includes('sin alta')) return message
  return null
}

export async function PATCH(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id, stayId } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) return jsonError('Solo el dueño puede corregir una hospitalización', 403)

    const body = await parseBody(request, staySchema)
    if ('response' in body) return body.response

    try {
      const situation = await loadSituation(session.supabase, id)
      if (!situation.hospitalizations.some((stay) => stay.id === stayId)) {
        return jsonError('No encontramos esa hospitalización', 404)
      }
      const conflict = stayConflict(situation.hospitalizations, { ...body.data, id: stayId })
      if (conflict) return jsonError(conflict, 400)

      const updated = await session.supabase
        .from('care_hospitalizations')
        .update({ admitted_on: body.data.admittedOn, discharged_on: body.data.dischargedOn })
        .eq('patient_id', id)
        .eq('id', stayId)
        .select('id')
      if (situationMissing(updated.error)) return jsonError(SITUATION_MISSING, 503)
      const known = stayError(updated.error)
      if (known) return jsonError(known, 400)
      if (updated.error) throw updated.error
      if (!updated.data?.length) return jsonError('No encontramos esa hospitalización', 404)

      return NextResponse.json({ role: access.role, ...(await loadSituation(session.supabase, id)) })
    } catch (error) {
      if (error instanceof SituationMissingError) return jsonError(SITUATION_MISSING, 503)
      throw error
    }
  })
}

export async function DELETE(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id, stayId } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) return jsonError('Solo el dueño puede quitar una hospitalización', 403)

    try {
      const removed = await session.supabase
        .from('care_hospitalizations')
        .delete()
        .eq('patient_id', id)
        .eq('id', stayId)
        .select('id')
      if (situationMissing(removed.error)) return jsonError(SITUATION_MISSING, 503)
      if (removed.error) throw removed.error
      if (!removed.data?.length) return jsonError('No encontramos esa hospitalización', 404)
      return NextResponse.json({ role: access.role, ...(await loadSituation(session.supabase, id)) })
    } catch (error) {
      if (error instanceof SituationMissingError) return jsonError(SITUATION_MISSING, 503)
      throw error
    }
  })
}
