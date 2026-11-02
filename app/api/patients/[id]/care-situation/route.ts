import { NextResponse } from 'next/server'
import { context, isOwner, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { loadSituation, SITUATION_MISSING, SituationMissingError, situationMissing } from '@/lib/api/care-situation'
import { dischargeSchema } from '@/lib/care/situation'

type Context = { params: Promise<{ id: string }> }

async function read(supabase: Parameters<typeof loadSituation>[0], patientId: string, role: string) {
  return NextResponse.json({ role, ...(await loadSituation(supabase, patientId)) })
}

export async function GET(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    try {
      return await read(session.supabase, id, access.role)
    } catch (error) {
      if (error instanceof SituationMissingError) return jsonError(SITUATION_MISSING, 503)
      throw error
    }
  })
}

export async function PUT(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) return jsonError('Solo el dueño puede cambiar la fecha de alta', 403)

    const body = await parseBody(request, dischargeSchema)
    if ('response' in body) return body.response

    try {
      if (body.data.dischargedOn == null) {
        const removed = await session.supabase.from('care_situations').delete().eq('patient_id', id)
        if (situationMissing(removed.error)) return jsonError(SITUATION_MISSING, 503)
        if (removed.error) throw removed.error
      } else {
        const saved = await session.supabase.from('care_situations').upsert(
          {
            patient_id: id,
            discharged_on: body.data.dischargedOn,
            updated_by: session.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'patient_id' },
        )
        if (situationMissing(saved.error)) return jsonError(SITUATION_MISSING, 503)
        if (saved.error) throw saved.error
      }
      return await read(session.supabase, id, access.role)
    } catch (error) {
      if (error instanceof SituationMissingError) return jsonError(SITUATION_MISSING, 503)
      throw error
    }
  })
}
