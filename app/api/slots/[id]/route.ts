import { NextResponse } from 'next/server'
import { slotBodySchema } from '@/lib/validation'
import { canEdit, context, jsonError, membership, parseBody, respond } from '@/lib/api/guard'
import { mapSlot, normalizeDate, normalizeHour, SLOT_COLUMNS, slotWrite, type SlotRow } from '@/lib/api/map'
import { earliestHourDate, planHourChange } from '@/lib/schedule/hour-change'
import { todayISO } from '@/lib/schedule/dates'
import { utcToLocalDateTime } from '@/lib/time/zoned'

type Context = { params: Promise<{ id: string }> }

const MISSING = 'No encontramos ese medicamento'
const FORBIDDEN = 'No puedes editar el esquema'
const MIGRATION = 'Todavía no se puede separar la hora de lo ya tomado. Falta aplicar la migración en la base de datos.'

type StoredSlot = SlotRow & { created_at: string }

function schemaMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (error.code === 'PGRST204' || error.code === 'PGRST202' || error.code === '42703' || error.code === '42883') {
    return true
  }
  const message = error.message ?? ''
  return message.includes('schema cache') && (message.includes('starts_on') || message.includes('split_medication_hour'))
}

function hourMessage(message: string) {
  const rules = [
    'La ingesta de hoy ya está tomada. La hora nueva puede partir desde mañana.',
    'La hora nueva parte en la ingesta de hoy, no en días anteriores.',
    'No quedan DAR pendientes en esta hora. Los tomados se quedan como están.',
    'Este medicamento ya no tiene ingestas desde esa fecha.',
    'Esta hora todavía no tiene días anteriores.',
    'No puedes editar el esquema',
    MISSING,
  ]
  return rules.find((rule) => message.includes(rule)) ?? null
}

export async function PATCH(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params

    const existing = await session.supabase
      .from('medication_slots')
      .select(`${SLOT_COLUMNS}, created_at`)
      .eq('id', id)
      .maybeSingle()
    if (schemaMissing(existing.error)) return jsonError(MIGRATION, 503)
    if (existing.error) throw existing.error
    if (!existing.data) return jsonError(MISSING, 404)
    const stored = existing.data as StoredSlot

    const role = await membership(session.supabase, session.user.id, stored.patient_id)
    if (!role) return jsonError(MISSING, 404)
    if (!canEdit(role)) return jsonError(FORBIDDEN, 403)

    const body = await parseBody(request, slotBodySchema)
    if ('response' in body) return body.response

    const today = todayISO()
    const mark = await session.supabase
      .from('dose_marks')
      .select('slot_id')
      .eq('slot_id', id)
      .eq('taken_on', today)
      .maybeSingle()
    if (mark.error) throw mark.error

    const takenToday = mark.data != null
    const effectiveOn = body.data.effectiveOn ?? earliestHourDate(today, takenToday)
    const plan = planHourChange({
      previousHour: normalizeHour(stored.hour),
      nextHour: body.data.hour,
      today,
      takenToday,
      effectiveOn,
      startsOn: normalizeDate(stored.starts_on),
      endDate: normalizeDate(stored.end_date),
      replacedOn: normalizeDate(stored.replaced_on),
      createdOn: utcToLocalDateTime(stored.created_at).date,
    })
    if (plan.action === 'reject') return jsonError(plan.message, 400)

    if (plan.action === 'keep' || plan.action === 'update') {
      const { data, error } = await session.supabase
        .from('medication_slots')
        .update(slotWrite(body.data))
        .eq('id', id)
        .select(SLOT_COLUMNS)
        .maybeSingle()
      if (schemaMissing(error)) return jsonError(MIGRATION, 503)
      if (error) throw error
      if (!data) return jsonError(MISSING, 404)
      return NextResponse.json(mapSlot(data as SlotRow))
    }

    const split = await session.supabase.rpc('split_medication_hour', {
      p_slot_id: id,
      p_effective_on: effectiveOn,
      p_name: body.data.name,
      p_brand_name: body.data.brandName?.trim() ?? '',
      p_dose: body.data.dose,
      p_hour: body.data.hour,
      p_kind: body.data.kind,
      p_end_date: body.data.kind === 'until' ? (body.data.endDate ?? null) : null,
      p_note: body.data.note.trim(),
    })
    if (schemaMissing(split.error)) return jsonError(MIGRATION, 503)
    if (split.error) {
      const message = hourMessage(split.error.message ?? '')
      if (message === FORBIDDEN) return jsonError(FORBIDDEN, 403)
      if (message === MISSING) return jsonError(MISSING, 404)
      if (message) return jsonError(message, 400)
      throw split.error
    }
    if (typeof split.data !== 'string' || split.data.length === 0) {
      throw new Error('No se pudo separar la hora')
    }

    const created = await session.supabase
      .from('medication_slots')
      .select(SLOT_COLUMNS)
      .eq('id', split.data)
      .maybeSingle()
    if (created.error) throw created.error
    if (!created.data) return jsonError(MISSING, 404)
    return NextResponse.json(mapSlot(created.data as SlotRow))
  })
}

export async function DELETE(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params

    const existing = await session.supabase
      .from('medication_slots')
      .select('id, patient_id')
      .eq('id', id)
      .maybeSingle()
    if (existing.error) throw existing.error
    if (!existing.data) return jsonError(MISSING, 404)

    const role = await membership(session.supabase, session.user.id, existing.data.patient_id)
    if (!role) return jsonError(MISSING, 404)
    if (!canEdit(role)) return jsonError(FORBIDDEN, 403)

    const removed = await session.supabase.from('medication_slots').delete().eq('id', id).select('id')
    if (removed.error) throw removed.error
    if (!removed.data?.length) return jsonError(MISSING, 404)
    return NextResponse.json({ ok: true })
  })
}
