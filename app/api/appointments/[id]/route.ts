import { NextResponse } from 'next/server'
import { APPOINTMENT_COLUMNS, appointmentWrite, mapAppointment, type AppointmentRow } from '@/lib/appointments/map'
import { appointmentBodySchema } from '@/lib/appointments/schema'
import { canEdit, context, jsonError, parseBody, requireRole, respond, type AppClient } from '@/lib/api/guard'
import { localDateTimeToUtc } from '@/lib/time/zoned'

type Context = { params: Promise<{ id: string }> }

async function loadOwned(supabase: AppClient, appointmentId: string) {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, patient_id')
    .eq('id', appointmentId)
    .maybeSingle()
  if (error) throw error
  return data as { id: string; patient_id: string } | null
}

export async function PATCH(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const existing = await loadOwned(session.supabase, id)
    if (!existing) return jsonError('No encontramos esa cita', 404)
    const access = await requireRole(session.supabase, session.user.id, existing.patient_id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes editar la cita', 403)

    const body = await parseBody(request, appointmentBodySchema)
    if ('response' in body) return body.response
    const written = appointmentWrite(body.data, localDateTimeToUtc(body.data.startsAt), session.user.id)
    const { data, error } = await session.supabase
      .from('appointments')
      .update({
        professional_name: written.professional_name,
        place: written.place,
        starts_at: written.starts_at,
        reason: written.reason,
        companion: written.companion,
        bring: written.bring,
        note: written.note,
        status: written.status,
      })
      .eq('id', id)
      .select(APPOINTMENT_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('No se pudo actualizar la cita')
    return NextResponse.json(mapAppointment(data as AppointmentRow))
  })
}

export async function DELETE(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const existing = await loadOwned(session.supabase, id)
    if (!existing) return jsonError('No encontramos esa cita', 404)
    const access = await requireRole(session.supabase, session.user.id, existing.patient_id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes borrar la cita', 403)

    const { error } = await session.supabase.from('appointments').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
