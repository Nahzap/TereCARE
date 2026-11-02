import { NextResponse } from 'next/server'
import { doseBodySchema } from '@/lib/validation'
import { canMark, context, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'

type Context = { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!canMark(access.role)) return jsonError('No puedes marcar tomas', 403)

    const body = await parseBody(request, doseBodySchema)
    if ('response' in body) return body.response

    const slot = await session.supabase
      .from('medication_slots')
      .select('id')
      .eq('id', body.data.slotId)
      .eq('patient_id', id)
      .maybeSingle()
    if (slot.error) throw slot.error
    if (!slot.data) return jsonError('No encontramos ese medicamento', 404)

    if (body.data.taken) {
      const { error } = await session.supabase.from('dose_marks').upsert(
        {
          patient_id: id,
          slot_id: body.data.slotId,
          taken_on: body.data.takenOn,
          marked_by: session.user.id,
          marked_at: new Date().toISOString(),
        },
        { onConflict: 'slot_id,taken_on' },
      )
      if (error) throw error
      return NextResponse.json({ taken: true })
    }

    const { error } = await session.supabase
      .from('dose_marks')
      .delete()
      .eq('patient_id', id)
      .eq('slot_id', body.data.slotId)
      .eq('taken_on', body.data.takenOn)
    if (error) throw error
    return NextResponse.json({ taken: false })
  })
}
