import type { AppClient } from '@/lib/api/guard'
import { asRows, normalizeDate } from '@/lib/api/map'
import {
  DEFAULT_LUNCH_HOURS,
  DEFAULT_LUNCH_RATE_CLP,
  type LunchRateRow,
} from '@/lib/lunch/lunch'

export const LUNCH_RATES_MISSING =
  'La tarifa del almuerzo todavía no está lista. Falta aplicar la migración en la base de datos.'

type RateRow = {
  id: string
  day_rate_clp: number
  hours_per_day: number
  effective_from: string
}

export function lunchRatesMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (['PGRST202', 'PGRST205', '42P01', '42703'].includes(error.code ?? '')) return true
  const message = error.message ?? ''
  return (
    message.includes('care_lunch_rates') ||
    (message.includes('schema cache') && message.includes('lunch'))
  )
}

export function mapLunchRate(row: RateRow): LunchRateRow {
  return {
    id: row.id,
    dayRateClp: row.day_rate_clp,
    hoursPerDay: Number(row.hours_per_day),
    effectiveFrom: normalizeDate(row.effective_from) ?? row.effective_from,
  }
}

export async function loadLunchRates(supabase: AppClient, patientId: string): Promise<LunchRateRow[] | null> {
  const { data, error } = await supabase
    .from('care_lunch_rates')
    .select('id, day_rate_clp, hours_per_day, effective_from')
    .eq('patient_id', patientId)
    .order('effective_from', { ascending: true })
  if (lunchRatesMissing(error)) return null
  if (error) throw error
  const rows = asRows<RateRow>(data).map(mapLunchRate)
  if (rows.length === 0) {
    return [
      {
        id: 'default',
        dayRateClp: DEFAULT_LUNCH_RATE_CLP,
        hoursPerDay: DEFAULT_LUNCH_HOURS,
        effectiveFrom: '2020-01-01',
      },
    ]
  }
  return rows
}
