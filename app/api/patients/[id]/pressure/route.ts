import { NextResponse } from 'next/server'
import { canEdit, context, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { asRows } from '@/lib/api/map'
import { mapPressure, pressureWrite, type PressureRow } from '@/lib/pressure/map'
import { nextReadingOrder } from '@/lib/pressure/reading'
import { pressureBodySchema } from '@/lib/pressure/schema'
import { localDateTimeToUtc, utcToLocalDateTime } from '@/lib/time/zoned'

type Context = { params: Promise<{ id: string }> }

const COLUMNS =
  'id, patient_id, measured_at, systolic, diastolic, pulse, day_part, reading_order, note, profiles(full_name, email)'

export async function GET(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const { data, error } = await session.supabase
      .from('blood_pressure_readings')
      .select(COLUMNS)
      .eq('patient_id', id)
      .order('measured_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({
      role: access.role,
      readings: asRows<PressureRow>(data).map(mapPressure),
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
    if (!canEdit(access.role)) return jsonError('No puedes registrar presión', 403)

    const body = await parseBody(request, pressureBodySchema)
    if ('response' in body) return body.response

    const measuredAt = new Date().toISOString()
    const localDate = utcToLocalDateTime(measuredAt).date
    const sameDay = await session.supabase
      .from('blood_pressure_readings')
      .select('reading_order')
      .eq('patient_id', id)
      .gte('measured_at', localDateTimeToUtc(`${localDate}T00:00`))
      .lte('measured_at', localDateTimeToUtc(`${localDate}T23:59`))
    if (sameDay.error) throw sameDay.error
    const readingOrder = nextReadingOrder(
      asRows<{ reading_order: number | null }>(sameDay.data).flatMap((row) =>
        typeof row.reading_order === 'number' ? [row.reading_order] : [],
      ),
    )

    const { data, error } = await session.supabase
      .from('blood_pressure_readings')
      .insert({
        patient_id: id,
        ...pressureWrite(body.data, measuredAt, readingOrder, session.user.id),
      })
      .select(COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('No se pudo guardar la presión')
    return NextResponse.json(mapPressure(data as PressureRow), { status: 201 })
  })
}
