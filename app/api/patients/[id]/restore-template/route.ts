import { NextResponse } from 'next/server'
import { TERESA_SLOTS } from '@/lib/schedule/template-teresa'
import { context, isOwner, jsonError, requireRole, respond } from '@/lib/api/guard'

type Context = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) {
      return jsonError('Solo el dueño puede restaurar la receta', 403)
    }

    const patient = await session.supabase
      .from('patients')
      .select('template_key')
      .eq('id', id)
      .maybeSingle()
    if (patient.error) throw patient.error
    if (!patient.data) return jsonError('No encontramos ese paciente', 404)
    if (patient.data.template_key !== 'teresa') {
      return jsonError('Este paciente no tiene receta inicial', 400)
    }

    const { error } = await session.supabase.rpc('restore_patient_template', {
      p_patient_id: id,
      p_slots: TERESA_SLOTS,
    })
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
