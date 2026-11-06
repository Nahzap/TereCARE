import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'

export function createAdminClient() {
  const { url } = supabaseEnv()
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!serviceRole) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY. Agrégala en .env.local (Project Settings → API → service_role en Supabase).',
    )
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
