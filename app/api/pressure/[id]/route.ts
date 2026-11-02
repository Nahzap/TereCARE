import { NextResponse } from 'next/server'
import { canEdit, context, jsonError, parseBody, requireRole, respond, type AppClient } from '@/lib/api/guard'
import { mapPressure, pressureNumbers, type PressureRow } from '@/lib/pressure/map'
import { pressureBodySchema } from '@/lib/pressure/schema'

type Context = { params: Promise<{ id: string }> }

const COLUMNS =
  'id, patient_id, measured_at, systolic, diastolic, pulse, day_part, reading_order, note, profiles(full_name, email)'

async function loadOwned(supabase: AppClient, readingId: string) {
  const { data, error } = await supabase
    .from('blood_pressure_readings')
    .select('id, patient_id')
    .eq('id', readingId)
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
    if (!existing) return jsonError('No encontramos esa medición', 404)
    const access = await requireRole(session.supabase, session.user.id, existing.patient_id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes editar la presión', 403)

    const body = await parseBody(request, pressureBodySchema)
    if ('response' in body) return body.response

    const { data, error } = await session.supabase
      .from('blood_pressure_readings')
      .update(pressureNumbers(body.data))
      .eq('id', id)
      .select(COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('No se pudo actualizar la presión')
    return NextResponse.json(mapPressure(data as PressureRow))
  })
}

export async function DELETE(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const existing = await loadOwned(session.supabase, id)
    if (!existing) return jsonError('No encontramos esa medición', 404)
    const access = await requireRole(session.supabase, session.user.id, existing.patient_id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes borrar la presión', 403)

    const { error } = await session.supabase.from('blood_pressure_readings').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
