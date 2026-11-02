import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import type { ZodError } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Role } from '@/lib/domain'
import { firstZodError } from '@/lib/validation'

export type AppClient = Awaited<ReturnType<typeof createClient>>

const UNAUTHORIZED = 'No has iniciado sesión'
const PATIENT_MISSING = 'No encontramos ese paciente'
const OPERATION_FAILED = 'No se pudo completar la operación'

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export function fail(error: unknown) {
  console.error(error)
  return jsonError(OPERATION_FAILED, 500)
}

export async function context(): Promise<
  { supabase: AppClient; user: User } | { response: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { response: jsonError(UNAUTHORIZED, 401) }
  }

  try {
    const { error } = await supabase.rpc('accept_my_invites')
    if (error) console.error(error)
  } catch (error) {
    console.error(error)
  }

  return { supabase, user }
}

export function asRole(value: unknown): Role | null {
  if (value === 'owner' || value === 'caregiver' || value === 'viewer') return value
  return null
}

export async function membership(
  supabase: AppClient,
  userId: string,
  patientId: string,
): Promise<Role | null> {
  const { data, error } = await supabase
    .from('patient_members')
    .select('role')
    .eq('patient_id', patientId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return asRole(data?.role)
}

export function canEdit(role: Role | null) {
  return role === 'owner' || role === 'caregiver'
}

export function canMark(role: Role | null) {
  return canEdit(role)
}

export function isOwner(role: Role | null) {
  return role === 'owner'
}

export async function requireRole(
  supabase: AppClient,
  userId: string,
  patientId: string,
): Promise<{ role: Role } | { response: NextResponse }> {
  const role = await membership(supabase, userId, patientId)
  if (!role) return { response: jsonError(PATIENT_MISSING, 404) }
  return { role }
}

type SafeParser<T> = {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: ZodError }
}

export async function parseBody<T>(
  request: Request,
  schema: SafeParser<T>,
): Promise<{ data: T } | { response: NextResponse }> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return { response: jsonError('El cuerpo de la solicitud no es válido', 400) }
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) return { response: jsonError(firstZodError(parsed.error), 400) }
  return { data: parsed.data }
}

export function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === '23505'
}

export async function respond(run: () => Promise<NextResponse>) {
  try {
    return await run()
  } catch (error) {
    return fail(error)
  }
}
