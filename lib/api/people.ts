import type { AppClient } from '@/lib/api/guard'
import { asRole } from '@/lib/api/guard'
import { asRows, profileEmail } from '@/lib/api/map'
import { buildPeople, type CarePerson, type CarePersonRow, type PersonMember } from '@/lib/coverage/people'

export const PEOPLE_MISSING =
  'Las personas de cuidado todavía no están listas. Falta aplicar la migración en la base de datos.'

export class PeopleMissingError extends Error {
  constructor() {
    super(PEOPLE_MISSING)
  }
}

export function phoneColumnMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const message = error.message ?? ''
  if (!message.toLowerCase().includes('phone')) return false
  return error.code === '42703' || error.code === 'PGRST204' || message.includes('schema cache')
}

export function peopleSchemaMissing(error: { code?: string; message?: string } | null) {
  if (!error || phoneColumnMissing(error)) return false
  if (['PGRST202', 'PGRST205', '42P01', '42703', '42883'].includes(error.code ?? '')) return true
  const message = error.message ?? ''
  return message.includes('schema cache') && (message.includes('care_people') || message.includes('person_id'))
}

export async function loadMembers(supabase: AppClient, patientId: string): Promise<PersonMember[]> {
  const { data, error } = await supabase
    .from('patient_members')
    .select('user_id, role, profiles!patient_members_user_id_fkey(email)')
    .eq('patient_id', patientId)
  if (error) throw error
  return asRows<{ user_id: string; role: string; profiles: unknown }>(data).flatMap((row) => {
    const role = asRole(row.role)
    return role ? [{ userId: row.user_id, email: profileEmail(row.profiles) ?? '', role }] : []
  })
}

async function selectPeople(supabase: AppClient, patientId: string) {
  const listed = (columns: string) =>
    supabase
      .from('care_people')
      .select(columns)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })

  const withPhone = await listed('id, display_name, email, phone, user_id')
  if (!phoneColumnMissing(withPhone.error)) return { ...withPhone, phoneReady: true }
  const withoutPhone = await listed('id, display_name, email, user_id')
  return { ...withoutPhone, phoneReady: false }
}

export async function loadPeople(supabase: AppClient, patientId: string): Promise<CarePerson[]> {
  const [peopleResult, members] = await Promise.all([selectPeople(supabase, patientId), loadMembers(supabase, patientId)])
  if (peopleSchemaMissing(peopleResult.error)) throw new PeopleMissingError()
  if (peopleResult.error) throw peopleResult.error
  const rows = asRows<CarePersonRow>(peopleResult.data).map((row) => ({ ...row, phone: row.phone ?? null }))
  return buildPeople(rows, members)
}
