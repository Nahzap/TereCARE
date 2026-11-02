import { isUniqueViolation, type AppClient } from '@/lib/api/guard'
import { loadPeople } from '@/lib/api/people'
import type { CarePersonDetail } from '@/lib/coverage/people'
import { historyBounds } from '@/lib/coverage/schedule'
import { todayISO } from '@/lib/schedule/dates'

export async function peopleWithHours(supabase: AppClient, patientId: string): Promise<CarePersonDetail[]> {
  const bounds = historyBounds(todayISO())
  const [people, totals] = await Promise.all([
    loadPeople(supabase, patientId),
    supabase.rpc('care_coverage_totals', { p_patient_id: patientId, p_from: bounds.earliest, p_to: bounds.latest }),
  ])
  if (totals.error) throw totals.error
  const hours = new Map<string, number>()
  const source = totals.data && typeof totals.data === 'object' ? (totals.data as { people?: unknown }).people : null
  for (const entry of Array.isArray(source) ? source : []) {
    const row = entry as { personId?: unknown; hours?: unknown }
    if (typeof row.personId === 'string') hours.set(row.personId, Number(row.hours) || 0)
  }
  return people.map((person) => ({ ...person, hours: hours.get(person.id) ?? 0 }))
}

export async function inviteCaregiver(supabase: AppClient, patientId: string, email: string, invitedBy: string) {
  const { error } = await supabase
    .from('patient_invites')
    .insert({ patient_id: patientId, email, role: 'caregiver', invited_by: invitedBy })
  if (error && !isUniqueViolation(error)) throw error
}

export async function dropPendingInvite(supabase: AppClient, patientId: string, email: string) {
  const { error } = await supabase
    .from('patient_invites')
    .delete()
    .eq('patient_id', patientId)
    .eq('email', email)
    .is('accepted_at', null)
  if (error) throw error
}
