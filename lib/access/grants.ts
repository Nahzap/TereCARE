import type { Role } from '@/lib/domain'
import { compareMembers, embedded, personName } from '@/lib/api/map'

export const MEMBER_COLUMNS =
  'user_id, role, profiles!patient_members_user_id_fkey(email, full_name), granter:profiles!patient_members_granted_by_fkey(full_name, email)'

export const GRANT_ROLES = ['caregiver', 'viewer'] as const

export type GrantRole = (typeof GRANT_ROLES)[number]

export const ACCESS_CAPABILITY: Record<Role, string> = {
  owner: 'Autoriza quién entra. Ve y modifica la ficha.',
  caregiver: 'Ve la ficha y anota cambios.',
  viewer: 'Ve la ficha. No la modifica.',
}

export type GrantRefusal = {
  code: 'forbidden' | 'invalid'
  message: string
}

export function normalizeAccountQuery(value: string) {
  const query = value.trim().toLowerCase()
  if (query.length < 2 || query.length > 80) return null
  return query
}

export function grantDecision(input: {
  actorRole: Role | null
  actorId: string
  targetUserId: string
  role: string
}): { role: GrantRole } | GrantRefusal {
  if (input.actorRole !== 'owner') {
    return { code: 'forbidden', message: 'Solo el responsable de la ficha puede vincular cuentas' }
  }
  if (input.targetUserId === input.actorId) {
    return { code: 'invalid', message: 'Ya eres el responsable de esta ficha' }
  }
  if (!isGrantRole(input.role)) {
    return { code: 'invalid', message: 'El acceso solo puede ser de modificación o de consulta' }
  }
  return { role: input.role }
}

export function roleChangeDecision(input: {
  actorRole: Role | null
  targetRole: Role | null
  role: string
}): { role: GrantRole } | GrantRefusal {
  if (input.actorRole !== 'owner') {
    return { code: 'forbidden', message: 'Solo el responsable de la ficha puede cambiar el acceso' }
  }
  if (input.targetRole === 'owner') {
    return { code: 'forbidden', message: 'El responsable de la ficha se mantiene' }
  }
  if (!input.targetRole) {
    return { code: 'invalid', message: 'No encontramos a esa persona en la ficha' }
  }
  if (!isGrantRole(input.role)) {
    return { code: 'invalid', message: 'El acceso solo puede ser de modificación o de consulta' }
  }
  return { role: input.role }
}

export type FichaMember = {
  userId: string
  email: string
  fullName: string | null
  role: Role
  grantedByName: string | null
}

export type FichaAccess = {
  id: string
  fullName: string
  role: Role
  members: FichaMember[]
}

export type AccessMemberRow = {
  patient_id: string
  user_id: string
  role: string
  profiles: unknown
  granter: unknown
}

export function groupFichaAccess(
  mine: readonly { patientId: string; fullName: string; role: Role }[],
  rows: readonly AccessMemberRow[],
  asRole: (value: string) => Role,
): FichaAccess[] {
  const byPatient = new Map<string, FichaMember[]>()
  for (const row of rows) {
    const profile = profileFields(row.profiles)
    const members = byPatient.get(row.patient_id) ?? []
    members.push({
      userId: row.user_id,
      email: profile.email,
      fullName: profile.fullName,
      role: asRole(row.role),
      grantedByName: personName(row.granter),
    })
    byPatient.set(row.patient_id, members)
  }

  return mine
    .map((ficha) => ({
      id: ficha.patientId,
      fullName: ficha.fullName,
      role: ficha.role,
      members: (byPatient.get(ficha.patientId) ?? []).sort(compareMembers),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' }))
}

function profileFields(value: unknown) {
  const profile = embedded<{ email?: string | null; full_name?: string | null }>(value)
  const fullName = profile?.full_name?.trim() ?? ''
  return {
    email: profile?.email?.trim() ?? '',
    fullName: fullName.length > 0 ? fullName : null,
  }
}

function isGrantRole(value: string): value is GrantRole {
  return (GRANT_ROLES as readonly string[]).includes(value)
}
