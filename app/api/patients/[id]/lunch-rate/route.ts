import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canEdit, context, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { loadLunchRates, lunchRatesMissing } from '@/lib/api/lunch-rates'
import {
  currentLunchRate,
  DEFAULT_LUNCH_HOURS,
  DEFAULT_LUNCH_RATE_CLP,
  LUNCH_HOURS_MAX,
  LUNCH_HOURS_MIN,
  LUNCH_RATE_MAX,
} from '@/lib/lunch/lunch'
import { todayISO } from '@/lib/schedule/dates'
import { isoDateSchema } from '@/lib/validation'

type Context = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  dayRateClp: z
    .number('Indica la tarifa del almuerzo en pesos')
    .int('La tarifa no lleva decimales')
    .min(1, 'La tarifa tiene que ser mayor que cero')
    .max(LUNCH_RATE_MAX, 'La tarifa es demasiado grande'),
  hoursPerDay: z
    .number('Indica las horas del almuerzo')
    .min(LUNCH_HOURS_MIN, 'Las horas del almuerzo son demasiado bajas')
    .max(LUNCH_HOURS_MAX, 'Las horas del almuerzo son demasiado altas'),
  effectiveFrom: isoDateSchema.optional(),
})

export async function GET(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const rates = await loadLunchRates(session.supabase, id)
    if (rates == null) return jsonError('La tarifa del almuerzo todavía no está lista. Falta aplicar la migración en la base de datos.', 503)
    const today = todayISO()
    const current = currentLunchRate(rates, today)
    return NextResponse.json({
      role: access.role,
      dayRateClp: current.dayRateClp,
      hoursPerDay: current.hoursPerDay,
      defaultDayRateClp: DEFAULT_LUNCH_RATE_CLP,
      defaultHoursPerDay: DEFAULT_LUNCH_HOURS,
      rates,
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
    if (!canEdit(access.role)) return jsonError('No puedes cambiar la tarifa del almuerzo', 403)

    const body = await parseBody(request, bodySchema)
    if ('response' in body) return body.response

    const today = todayISO()
    const effectiveFrom = body.data.effectiveFrom ?? today
    if (effectiveFrom < today) {
      return jsonError('La nueva tarifa no puede aplicar a fechas ya pasadas. Así no se alteran los almuerzos ya anotados.', 400)
    }

    const existing = await session.supabase
      .from('care_lunch_rates')
      .select('id, day_rate_clp, hours_per_day, effective_from')
      .eq('patient_id', id)
      .eq('effective_from', effectiveFrom)
      .maybeSingle()
    if (lunchRatesMissing(existing.error)) {
      return jsonError('La tarifa del almuerzo todavía no está lista. Falta aplicar la migración en la base de datos.', 503)
    }
    if (existing.error) throw existing.error

    if (existing.data) {
      const updated = await session.supabase
        .from('care_lunch_rates')
        .update({
          day_rate_clp: body.data.dayRateClp,
          hours_per_day: body.data.hoursPerDay,
        })
        .eq('id', existing.data.id)
        .eq('patient_id', id)
      if (lunchRatesMissing(updated.error)) {
        return jsonError('La tarifa del almuerzo todavía no está lista. Falta aplicar la migración en la base de datos.', 503)
      }
      if (updated.error) throw updated.error
    } else {
      const inserted = await session.supabase.from('care_lunch_rates').insert({
        patient_id: id,
        day_rate_clp: body.data.dayRateClp,
        hours_per_day: body.data.hoursPerDay,
        effective_from: effectiveFrom,
        created_by: session.user.id,
      })
      if (lunchRatesMissing(inserted.error)) {
        return jsonError('La tarifa del almuerzo todavía no está lista. Falta aplicar la migración en la base de datos.', 503)
      }
      if (inserted.error) throw inserted.error
    }

    const rates = await loadLunchRates(session.supabase, id)
    if (rates == null) {
      return jsonError('La tarifa del almuerzo todavía no está lista. Falta aplicar la migración en la base de datos.', 503)
    }
    const current = currentLunchRate(rates, today)
    return NextResponse.json({
      role: access.role,
      dayRateClp: current.dayRateClp,
      hoursPerDay: current.hoursPerDay,
      defaultDayRateClp: DEFAULT_LUNCH_RATE_CLP,
      defaultHoursPerDay: DEFAULT_LUNCH_HOURS,
      rates,
    })
  })
}
