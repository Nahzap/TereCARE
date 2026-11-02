import type { AppClient } from '@/lib/api/guard'
import { asRows, normalizeDate } from '@/lib/api/map'
import type { CareSituation } from '@/lib/care/situation'

export const SITUATION_MISSING =
  'La fecha de alta todavía no está lista. Falta aplicar la migración en la base de datos.'

export class SituationMissingError extends Error {
  constructor() {
    super(SITUATION_MISSING)
  }
}

export function situationMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (['PGRST202', 'PGRST205', '42P01', '42703', '42883'].includes(error.code ?? '')) return true
  const message = error.message ?? ''
  return (
    message.includes('schema cache') &&
    (message.includes('care_situation') || message.includes('care_hospitalization') || message.includes('countableDays'))
  )
}

type StayRow = { id: string; admitted_on: string; discharged_on: string | null }

export async function loadSituation(supabase: AppClient, patientId: string): Promise<CareSituation> {
  const situation = await supabase
    .from('care_situations')
    .select('discharged_on')
    .eq('patient_id', patientId)
    .maybeSingle()
  if (situationMissing(situation.error)) throw new SituationMissingError()
  if (situation.error) throw situation.error

  const stays = await supabase
    .from('care_hospitalizations')
    .select('id, admitted_on, discharged_on')
    .eq('patient_id', patientId)
    .order('admitted_on', { ascending: true })
    .order('id', { ascending: true })
  if (situationMissing(stays.error)) throw new SituationMissingError()
  if (stays.error) throw stays.error

  return {
    dischargedOn: normalizeDate(situation.data?.discharged_on ?? null),
    hospitalizations: asRows<StayRow>(stays.data).map((row) => ({
      id: row.id,
      admittedOn: normalizeDate(row.admitted_on) ?? row.admitted_on,
      dischargedOn: normalizeDate(row.discharged_on),
    })),
  }
}
