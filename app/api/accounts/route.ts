import { NextResponse } from 'next/server'
import { normalizeAccountQuery } from '@/lib/access/grants'
import { context, jsonError, respond } from '@/lib/api/guard'
import { asRows } from '@/lib/api/map'

type AccountRow = {
  id: string
  email: string
  full_name: string | null
}

export async function GET(request: Request) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response

    const query = normalizeAccountQuery(new URL(request.url).searchParams.get('q') ?? '')
    if (!query) return jsonError('Escribe al menos dos letras del nombre o del correo', 400)

    const owned = await session.supabase
      .from('patient_members')
      .select('patient_id')
      .eq('user_id', session.user.id)
      .eq('role', 'owner')
      .limit(1)
    if (owned.error) throw owned.error
    if (!owned.data?.length) return jsonError('Crea una ficha para vincular cuentas', 403)

    const found = await session.supabase.rpc('search_accounts', { p_query: query })
    if (found.error) throw found.error

    return NextResponse.json(
      asRows<AccountRow>(found.data).map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name?.trim() || null,
      })),
    )
  })
}
