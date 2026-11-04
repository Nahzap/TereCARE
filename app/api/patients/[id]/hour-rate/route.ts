import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canEdit, context, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { hourRatesMissing, loadHourRates } from '@/lib/api/hour-rates'
import { currentHourRate, DEFAULT_HOUR_RATE_CLP, HOUR_RATE_MAX } from '@/lib/contributions/equivalent'
import { todayISO } from '@/lib/schedule/dates'
import { isoDateSchema } from '@/lib/validation'

type Context = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  rateClp: z
    .number('Indica la tarifa en pesos')
    .int('La tarifa no lleva decimales')
    .min(1, 'La tarifa tiene que ser mayor que cero')
    .max(HOUR_RATE_MAX, 'La tarifa es demasiado grande'),
  effectiveFrom: isoDateSchema.optional(),
})

export async function GET(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const rates = await loadHourRates(session.supabase, id)
    if (rates == null) return jsonError('La tarifa de la hora de cuidado todavía no está lista. Falta aplicar la migración en la base de datos.', 503)
    const today = todayISO()
    return NextResponse.json({
      role: access.role,
      rateClp: currentHourRate(rates, today),
      defaultRateClp: DEFAULT_HOUR_RATE_CLP,
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
    if (!canEdit(access.role)) return jsonError('No puedes cambiar la tarifa de la hora', 403)

    const body = await parseBody(request, bodySchema)
    if ('response' in body) return body.response

    const today = todayISO()
    const effectiveFrom = body.data.effectiveFrom ?? today
    if (effectiveFrom < today) {
      return jsonError('La nueva tarifa no puede aplicar a fechas ya pasadas. Así no se alteran las horas ya anotadas.', 400)
    }

    const existing = await session.supabase
      .from('care_hour_rates')
      .select('id, rate_clp, effective_from')
      .eq('patient_id', id)
      .eq('effective_from', effectiveFrom)
      .maybeSingle()
    if (hourRatesMissing(existing.error)) {
      return jsonError('La tarifa de la hora de cuidado todavía no está lista. Falta aplicar la migración en la base de datos.', 503)
    }
    if (existing.error) throw existing.error

    if (existing.data) {
      const updated = await session.supabase
        .from('care_hour_rates')
        .update({ rate_clp: body.data.rateClp })
        .eq('id', existing.data.id)
        .eq('patient_id', id)
      if (hourRatesMissing(updated.error)) {
        return jsonError('La tarifa de la hora de cuidado todavía no está lista. Falta aplicar la migración en la base de datos.', 503)
      }
      if (updated.error) throw updated.error
    } else {
      const inserted = await session.supabase.from('care_hour_rates').insert({
        patient_id: id,
        rate_clp: body.data.rateClp,
        effective_from: effectiveFrom,
        created_by: session.user.id,
      })
      if (hourRatesMissing(inserted.error)) {
        return jsonError('La tarifa de la hora de cuidado todavía no está lista. Falta aplicar la migración en la base de datos.', 503)
      }
      if (inserted.error) throw inserted.error
    }

    const rates = await loadHourRates(session.supabase, id)
    if (rates == null) {
      return jsonError('La tarifa de la hora de cuidado todavía no está lista. Falta aplicar la migración en la base de datos.', 503)
    }
    return NextResponse.json({
      role: access.role,
      rateClp: currentHourRate(rates, today),
      defaultRateClp: DEFAULT_HOUR_RATE_CLP,
      rates,
    })
  })
}
