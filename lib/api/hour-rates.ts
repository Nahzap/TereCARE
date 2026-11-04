import type { AppClient } from '@/lib/api/guard'
import { asRows, normalizeDate } from '@/lib/api/map'
import { DEFAULT_HOUR_RATE_CLP, type HourRateRow } from '@/lib/contributions/equivalent'

export const HOUR_RATES_MISSING =
  'La tarifa de la hora de cuidado todavía no está lista. Falta aplicar la migración en la base de datos.'

type RateRow = {
  id: string
  rate_clp: number
  effective_from: string
}

export function hourRatesMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (['PGRST202', 'PGRST205', '42P01', '42703'].includes(error.code ?? '')) return true
  const message = error.message ?? ''
  return message.includes('care_hour_rates') || (message.includes('schema cache') && message.includes('hour_rate'))
}

export function mapHourRate(row: RateRow): HourRateRow {
  return {
    id: row.id,
    rateClp: row.rate_clp,
    effectiveFrom: normalizeDate(row.effective_from) ?? row.effective_from,
  }
}

export async function loadHourRates(supabase: AppClient, patientId: string): Promise<HourRateRow[] | null> {
  const { data, error } = await supabase
    .from('care_hour_rates')
    .select('id, rate_clp, effective_from')
    .eq('patient_id', patientId)
    .order('effective_from', { ascending: true })
  if (hourRatesMissing(error)) return null
  if (error) throw error
  const rows = asRows<RateRow>(data).map(mapHourRate)
  if (rows.length === 0) {
    return [{ id: 'default', rateClp: DEFAULT_HOUR_RATE_CLP, effectiveFrom: '2020-01-01' }]
  }
  return rows
}
