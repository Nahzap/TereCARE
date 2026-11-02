import { NextResponse } from 'next/server'
import { context, isOwner, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { loadSituation, SITUATION_MISSING, SituationMissingError, situationMissing } from '@/lib/api/care-situation'
import { stayConflict, staySchema } from '@/lib/care/situation'

type Context = { params: Promise<{ id: string }> }

function stayError(error: { message?: string } | null) {
  const message = error?.message ?? ''
  if (message.includes('cruza') || message.includes('anterior') || message.includes('sin alta')) return message
  return null
}

export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) return jsonError('Solo el dueño puede registrar una hospitalización', 403)

    const body = await parseBody(request, staySchema)
    if ('response' in body) return body.response

    try {
      const situation = await loadSituation(session.supabase, id)
      const conflict = stayConflict(situation.hospitalizations, body.data)
      if (conflict) return jsonError(conflict, 400)

      const inserted = await session.supabase
        .from('care_hospitalizations')
        .insert({
          patient_id: id,
          admitted_on: body.data.admittedOn,
          discharged_on: body.data.dischargedOn,
          created_by: session.user.id,
        })
        .select('id')
        .maybeSingle()
      if (situationMissing(inserted.error)) return jsonError(SITUATION_MISSING, 503)
      const known = stayError(inserted.error)
      if (known) return jsonError(known, 400)
      if (inserted.error) throw inserted.error
      if (!inserted.data) throw new Error('No se pudo registrar la hospitalización')

      return NextResponse.json({ role: access.role, ...(await loadSituation(session.supabase, id)) }, { status: 201 })
    } catch (error) {
      if (error instanceof SituationMissingError) return jsonError(SITUATION_MISSING, 503)
      throw error
    }
  })
}
