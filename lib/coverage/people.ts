import { z } from 'zod'
import type { Role } from '../domain'
import { isAssignableRole } from './schedule'

export type CarePerson = {
  id: string
  name: string
  email: string | null
  phone: string | null
  userId: string | null
  role: Role | null
  assignable: boolean
}

export type CarePersonDetail = CarePerson & { hours: number }

export type CarePersonRow = {
  id: string
  display_name: string
  email: string | null
  phone?: string | null
  user_id: string | null
}

export type PersonMember = { userId: string; email: string; role: Role }

const nameField = z
  .string('Escribe el nombre')
  .trim()
  .min(1, 'Escribe el nombre')
  .max(120, 'El nombre no puede superar 120 caracteres')

const emailField = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.union([z.literal(''), z.email('Ingresa un correo válido').max(254, 'El correo es demasiado largo')]).nullable(),
)

const PHONE_PATTERN = /^\+?[0-9][0-9 ().-]{6,22}$/

const phoneField = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.union([
    z.literal(''),
    z
      .string()
      .min(8, 'Escribe un teléfono válido')
      .max(24, 'El teléfono es demasiado largo')
      .regex(PHONE_PATTERN, 'Escribe un teléfono válido'),
  ]).nullable(),
)

export const personCreateSchema = z.object({
  name: nameField,
  email: emailField.optional(),
  phone: phoneField.optional(),
})

export const personUpdateSchema = z
  .object({
    name: nameField.optional(),
    email: emailField.optional(),
    phone: phoneField.optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.email !== undefined || body.phone !== undefined,
    'No hay cambios para guardar',
  )

export const inviteDraftSchema = z
  .object({
    email: z.email('Ingresa un correo válido'),
    role: z.enum(['caregiver', 'viewer'], 'Elige cuidador o solo lectura'),
    name: z.string().trim().max(120, 'El nombre no puede superar 120 caracteres').optional(),
    phone: phoneField.optional(),
  })
  .superRefine((body, context) => {
    if (body.role === 'caregiver' && !body.name) {
      context.addIssue({ code: 'custom', message: 'Escribe el nombre del cuidador', path: ['name'] })
    }
  })

export const inviteProfileSchema = z.object({
  name: z.string().trim().max(120, 'El nombre no puede superar 120 caracteres').optional(),
  email: z.email('Ingresa un correo válido'),
  phone: phoneField.optional(),
})

export const personMergeSchema = z.object({
  targetId: z.uuid('Elige con quién fusionar'),
})

export function cleanEmail(value: string | null | undefined) {
  return value ? value : null
}

export function cleanPhone(value: string | null | undefined) {
  const phone = value?.trim() ?? ''
  return phone ? phone : null
}

export function buildPeople(rows: readonly CarePersonRow[], members: readonly PersonMember[]): CarePerson[] {
  const byUser = new Map(members.map((member) => [member.userId, member]))
  return rows.map((row) => {
    const member = row.user_id ? byUser.get(row.user_id) : undefined
    return {
      id: row.id,
      name: row.display_name.trim() || 'Cuidador',
      email: row.user_id ? member?.email || row.email : row.email,
      phone: row.phone?.trim() || null,
      userId: row.user_id,
      role: member?.role ?? null,
      assignable: row.user_id == null || (member != null && isAssignableRole(member.role)),
    }
  })
}

export function personStatus(person: Pick<CarePerson, 'userId' | 'role' | 'email'>) {
  if (person.userId && person.role) return 'Con cuenta'
  if (person.userId) return 'Ya no tiene acceso'
  return person.email ? 'Sin cuenta, se unirá al entrar con ese correo' : 'Sin cuenta'
}

export function mergeTargets<T extends Pick<CarePerson, 'id' | 'assignable'>>(people: readonly T[], sourceId: string) {
  return people.filter((person) => person.id !== sourceId && person.assignable)
}
