import { NextResponse } from 'next/server'
import { context, isUniqueViolation, respond } from '@/lib/api/guard'
import { mapMe, type ProfileRow } from '@/lib/api/map'

const PROFILE_COLUMNS = 'id, email, full_name, avatar_url'

export async function GET() {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { supabase, user } = session

    const existing = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', user.id)
      .maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data) return NextResponse.json(mapMe(existing.data as ProfileRow))

    const inserted = await supabase
      .from('profiles')
      .insert({ id: user.id, email: user.email ?? '' })
      .select(PROFILE_COLUMNS)
      .maybeSingle()

    if (inserted.error) {
      if (!isUniqueViolation(inserted.error)) throw inserted.error
      const again = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', user.id)
        .maybeSingle()
      if (again.error) throw again.error
      if (!again.data) throw inserted.error
      return NextResponse.json(mapMe(again.data as ProfileRow))
    }

    if (!inserted.data) throw new Error('No se pudo crear el perfil')
    return NextResponse.json(mapMe(inserted.data as ProfileRow))
  })
}
