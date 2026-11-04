import { isUniqueViolation, type AppClient } from '@/lib/api/guard'
import { loadMembers, loadPeople, PEOPLE_MISSING, phoneColumnMissing, peopleSchemaMissing } from '@/lib/api/people'
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

type PersonWrite = {
  mode: 'insert' | 'update'
  patientId: string
  id?: string
  actorId?: string
  name: string
  email?: string | null
  phone: string | null
}

export type PersonWriteResult =
  | { ok: true; createdId: string | null; phoneSaved: boolean }
  | { error: string; status: number }

function phoneCheckFailed(error: { code?: string; message?: string } | null) {
  return error?.code === '23514' && (error.message ?? '').includes('phone')
}

export async function savePerson(supabase: AppClient, input: PersonWrite): Promise<PersonWriteResult> {
  const values: Record<string, unknown> = { display_name: input.name }
  if (input.email !== undefined) values.email = input.email

  const run = (withPhone: boolean) => {
    const row = withPhone ? { ...values, phone: input.phone } : values
    if (input.mode === 'insert') {
      return supabase
        .from('care_people')
        .insert({ patient_id: input.patientId, created_by: input.actorId, ...row })
        .select('id')
        .maybeSingle()
    }
    return supabase
      .from('care_people')
      .update(row)
      .eq('id', input.id ?? '')
      .eq('patient_id', input.patientId)
      .select('id')
      .maybeSingle()
  }

  let written = await run(true)
  let phoneSaved = true
  if (phoneColumnMissing(written.error)) {
    written = await run(false)
    phoneSaved = input.phone == null
  }
  if (peopleSchemaMissing(written.error)) return { error: PEOPLE_MISSING, status: 503 }
  if (isUniqueViolation(written.error)) return { error: 'Ya hay una persona con ese correo', status: 409 }
  if (phoneCheckFailed(written.error)) return { error: 'Escribe un teléfono válido', status: 400 }
  if (written.error) throw written.error
  const createdId = input.mode === 'insert' ? (written.data?.id ?? null) : null
  if (input.mode === 'insert' && !createdId) throw new Error('No se pudo agregar a la persona')
  return { ok: true, createdId, phoneSaved }
}

export async function prepareCaregiver(
  supabase: AppClient,
  patientId: string,
  actorId: string,
  input: { name: string; email: string; phone: string | null; fromEmail?: string | null },
): Promise<PersonWriteResult> {
  const people = await loadPeople(supabase, patientId)
  const match = (email: string | null | undefined) => (email ? people.find((person) => person.email === email) : undefined)
  const current = match(input.fromEmail) ?? match(input.email)
  const occupied = match(input.email)
  if (occupied && (!current || occupied.id !== current.id)) {
    return { error: 'Ya hay una persona con ese correo', status: 409 }
  }
  if (current?.userId) {
    return savePerson(supabase, {
      mode: 'update',
      patientId,
      id: current.id,
      name: input.name,
      phone: input.phone,
    })
  }

  const members = await loadMembers(supabase, patientId)
  if (members.some((member) => member.email === input.email)) {
    return { error: 'Ese correo ya tiene cuenta en la ficha. Usa Fusionar para unir a las dos personas.', status: 409 }
  }
  if (current) {
    return savePerson(supabase, {
      mode: 'update',
      patientId,
      id: current.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
    })
  }
  return savePerson(supabase, {
    mode: 'insert',
    patientId,
    actorId,
    name: input.name,
    email: input.email,
    phone: input.phone,
  })
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
