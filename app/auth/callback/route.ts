import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')
  const origin = requestUrl.origin
  const providerError = requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error')
  const loginUrl = new URL('/login', origin)
  loginUrl.searchParams.set('error', 'auth')
  if (providerError) {
    console.error('Auth callback:', providerError)
    loginUrl.searchParams.set('reason', providerError)
  }

  if (!code && !tokenHash) {
    return NextResponse.redirect(loginUrl)
  }

  try {
    const supabase = await createClient()
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as 'signup' | 'email' | 'magiclink' | 'recovery' | 'invite',
      })
      if (error) return NextResponse.redirect(loginUrl)
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) return NextResponse.redirect(loginUrl)
    } else {
      return NextResponse.redirect(loginUrl)
    }

    const { error: inviteError } = await supabase.rpc('accept_my_invites')
    if (inviteError) console.error(inviteError)

    const nextParam = requestUrl.searchParams.get('next')
    const goDefine =
      type === 'recovery' ||
      requestUrl.searchParams.get('type') === 'recovery' ||
      nextParam === 'definir-contrasena'
    return NextResponse.redirect(goDefine ? `${origin}/definir-contrasena` : `${origin}/pacientes`)
  } catch {
    return NextResponse.redirect(loginUrl)
  }
}
