import { NextResponse } from 'next/server'
import { APPOINTMENT_COLUMNS, appointmentWrite, mapAppointment, type AppointmentRow } from '@/lib/appointments/map'
import { appointmentBodySchema } from '@/lib/appointments/schema'
import { canEdit, context, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { asRows } from '@/lib/api/map'
import { localDateTimeToUtc } from '@/lib/time/zoned'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const { data, error } = await session.supabase
      .from('appointments')
      .select(APPOINTMENT_COLUMNS)
      .eq('patient_id', id)
      .order('starts_at', { ascending: true })
    if (error) throw error
    return NextResponse.json({
      role: access.role,
      appointments: asRows<AppointmentRow>(data).map(mapAppointment),
    })
  })
}

export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes registrar citas', 403)

    const body = await parseBody(request, appointmentBodySchema)
    if ('response' in body) return body.response

    const { data, error } = await session.supabase
      .from('appointments')
      .insert({
        patient_id: id,
        ...appointmentWrite(body.data, localDateTimeToUtc(body.data.startsAt), session.user.id),
      })
      .select(APPOINTMENT_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('No se pudo guardar la cita')
    return NextResponse.json(mapAppointment(data as AppointmentRow), { status: 201 })
  })
}
