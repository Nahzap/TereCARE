import { NextResponse } from 'next/server'
import { profileBodySchema } from '@/lib/auth/access'
import { context, isUniqueViolation, jsonError, parseBody, respond, type AppClient } from '@/lib/api/guard'
import { asRows, mapMe, type ProfileRow } from '@/lib/api/map'
import { cleanPhone } from '@/lib/coverage/people'

const PROFILE_COLUMNS = 'id, email, full_name, avatar_url'

async function ensureProfile(supabase: AppClient, userId: string, email: string) {
  const existing = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data as ProfileRow

  const inserted = await supabase
    .from('profiles')
    .insert({ id: userId, email })
    .select(PROFILE_COLUMNS)
    .maybeSingle()
  if (inserted.error) {
    if (!isUniqueViolation(inserted.error)) throw inserted.error
    const again = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle()
    if (again.error) throw again.error
    if (!again.data) throw inserted.error
    return again.data as ProfileRow
  }
  if (!inserted.data) throw new Error('No se pudo crear el perfil')
  return inserted.data as ProfileRow
}

async function linkedPhone(supabase: AppClient, userId: string) {
  const people = await supabase.from('care_people').select('phone').eq('user_id', userId).not('phone', 'is', null).limit(5)
  if (people.error) {
    if (people.error.code === '42703' || (people.error.message ?? '').includes('phone')) return null
    throw people.error
  }
  const row = asRows<{ phone: string | null }>(people.data).find((entry) => entry.phone?.trim())
  return row?.phone?.trim() || null
}

export async function GET() {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const profile = await ensureProfile(session.supabase, session.user.id, session.user.email ?? '')
    const phone = await linkedPhone(session.supabase, session.user.id)
    return NextResponse.json({ ...mapMe(profile), phone })
  })
}

export async function PATCH(request: Request) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const body = await parseBody(request, profileBodySchema)
    if ('response' in body) return body.response

    await ensureProfile(session.supabase, session.user.id, session.user.email ?? '')
    const updated = await session.supabase
      .from('profiles')
      .update({ full_name: body.data.fullName })
      .eq('id', session.user.id)
      .select(PROFILE_COLUMNS)
      .maybeSingle()
    if (updated.error) throw updated.error
    if (!updated.data) return jsonError('No se pudo guardar el perfil', 500)

    let phone = await linkedPhone(session.supabase, session.user.id)
    if (body.data.phone !== undefined) {
      const nextPhone = cleanPhone(body.data.phone)
      const linked = await session.supabase.from('care_people').update({ phone: nextPhone }).eq('user_id', session.user.id)
      if (linked.error) {
        const message = linked.error.message ?? ''
        if (linked.error.code === '23514' && message.includes('phone')) {
          return jsonError('Escribe un teléfono válido', 400)
        }
        if (linked.error.code !== '42703' && !message.includes('phone')) throw linked.error
      } else {
        phone = nextPhone
      }
    }

    return NextResponse.json({ ...mapMe(updated.data as ProfileRow), phone })
  })
}
