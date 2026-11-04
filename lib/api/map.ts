import type { DoseMark, Invite, Me, Member, PatientDetail, Role, Slot, SlotKind } from '@/lib/domain'
import type { SlotBodyOutput } from '@/lib/validation'

export const SLOT_COLUMNS =
  'id, patient_id, name, brand_name, dose, hour, kind, end_date, note, starts_on, replaced_on, replaces_slot_id'

export type PatientRow = {
  id: string
  full_name: string
  template_key: string | null
}

export type SlotRow = {
  id: string
  patient_id: string
  name: string
  brand_name: string | null
  dose: string
  hour: string
  kind: string
  end_date: string | null
  note: string | null
  starts_on: string | null
  replaced_on: string | null
  replaces_slot_id: string | null
}

export type ProfileRow = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
}

export function normalizeHour(hour: string) {
  return hour.length > 5 ? hour.slice(0, 5) : hour
}

export function normalizeDate(value: string | null | undefined) {
  if (value == null || value === '') return null
  return value.length > 10 ? value.slice(0, 10) : value
}

export function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

export function embedded<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    const first = value[0]
    if (first && typeof first === 'object') return first as T
    return null
  }
  if (value && typeof value === 'object') return value as T
  return null
}

function asKind(value: string): SlotKind {
  if (value === 'fixed' || value === 'until' || value === 'sos') return value
  throw new Error(`Tipo de toma desconocido: ${value}`)
}

function asMemberRole(value: string): Role {
  if (value === 'owner' || value === 'caregiver' || value === 'viewer') return value
  throw new Error(`Rol de miembro desconocido: ${value}`)
}

function asInviteRole(value: string): Invite['role'] {
  if (value === 'caregiver' || value === 'viewer') return value
  throw new Error(`Rol de invitación desconocido: ${value}`)
}

export function mapSlot(row: SlotRow): Slot {
  return {
    id: row.id,
    patientId: row.patient_id,
    name: row.name,
    brandName: row.brand_name?.trim() ?? '',
    dose: row.dose,
    hour: normalizeHour(row.hour),
    kind: asKind(row.kind),
    endDate: normalizeDate(row.end_date),
    note: row.note ?? '',
    startsOn: normalizeDate(row.starts_on),
    replacedOn: normalizeDate(row.replaced_on),
    replacesSlotId: row.replaces_slot_id,
  }
}

export function mapPatientDetail(row: PatientRow, role: Role): PatientDetail {
  return {
    id: row.id,
    fullName: row.full_name,
    templateKey: row.template_key ?? null,
    role,
  }
}

export function mapMe(row: ProfileRow): Me {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
  }
}

export function mapMember(row: { user_id: string; role: string; profiles: unknown }): Member {
  const profile = embedded<{ email?: string | null; full_name?: string | null }>(row.profiles)
  return {
    userId: row.user_id,
    email: profile?.email?.trim() ?? '',
    fullName: profile?.full_name ?? null,
    role: asMemberRole(row.role),
  }
}

export function compareMembers(a: Member, b: Member) {
  if (a.role === 'owner' && b.role !== 'owner') return -1
  if (b.role === 'owner' && a.role !== 'owner') return 1
  const left = a.fullName || a.email
  const right = b.fullName || b.email
  return left.localeCompare(right, 'es', { sensitivity: 'base' })
}

export function mapInvite(
  row: {
    id: string
    email: string
    role: string
    created_at: string
  },
  person?: { name: string; phone: string | null } | null,
): Invite {
  return {
    id: row.id,
    email: row.email,
    role: asInviteRole(row.role),
    createdAt: row.created_at,
    name: person?.name ?? null,
    phone: person?.phone ?? null,
  }
}

export function personName(value: unknown) {
  const profile = embedded<{ full_name?: string | null; email?: string | null }>(value)
  return profile?.full_name?.trim() || profile?.email?.trim() || null
}

export function mapMark(row: { slot_id: string; taken_on: string; profiles: unknown }): DoseMark {
  return {
    slotId: row.slot_id,
    takenOn: normalizeDate(row.taken_on) ?? row.taken_on,
    markedByName: personName(row.profiles),
  }
}

export function profileEmail(value: unknown) {
  const profile = embedded<{ email?: string | null }>(value)
  const email = profile?.email?.trim().toLowerCase()
  return email || null
}

export function slotWrite(body: SlotBodyOutput) {
  return {
    name: body.name,
    brand_name: body.brandName?.trim() ?? '',
    dose: body.dose,
    hour: body.hour,
    kind: body.kind,
    end_date: body.kind === 'until' ? (body.endDate ?? null) : null,
    note: body.note.trim(),
  }
}
