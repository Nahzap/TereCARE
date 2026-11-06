import type { AppClient } from '@/lib/api/guard'
import { asRows, normalizeDate } from '@/lib/api/map'
import type { LunchSlot } from '@/lib/lunch/lunch'

export const LUNCHES_MISSING =
  'Los almuerzos todavía no están listos. Falta aplicar la migración en la base de datos.'

type LunchRow = {
  id: string
  person_id: string
  lunch_on: string
  rate_clp?: number | null
  hours?: number | null
}

export function lunchesMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (['PGRST202', 'PGRST205', '42P01', '42703', '42883'].includes(error.code ?? '')) return true
  const message = error.message ?? ''
  return (
    message.includes('care_lunches') ||
    message.includes('set_care_lunch') ||
    (message.includes('schema cache') && message.includes('lunch'))
  )
}

export async function loadLunches(
  supabase: AppClient,
  patientId: string,
  from: string,
  to: string,
  names: ReadonlyMap<string, string>,
): Promise<LunchSlot[] | null> {
  const { data, error } = await supabase
    .from('care_lunches')
    .select('id, person_id, lunch_on, rate_clp, hours')
    .eq('patient_id', patientId)
    .gte('lunch_on', from)
    .lte('lunch_on', to)
    .order('lunch_on', { ascending: true })
    .order('person_id', { ascending: true })
  if (lunchesMissing(error)) return null
  if (error) throw error
  return asRows<LunchRow>(data).map((row) => ({
    personId: row.person_id,
    lunchOn: normalizeDate(row.lunch_on) ?? row.lunch_on,
    caregiverName: names.get(row.person_id) ?? 'Cuidador',
    rateClp: row.rate_clp ?? undefined,
    hours: row.hours != null ? Number(row.hours) : undefined,
  }))
}
