import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseEnv } from './env'

type PendingCookie = {
  name: string
  value: string
  options: CookieOptions
}

function applySessionCookies(
  response: NextResponse,
  cookiesToSet: PendingCookie[],
  headers: Record<string, string>,
) {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })
  Object.entries(headers).forEach(([name, value]) => {
    response.headers.set(name, value)
  })
  return response
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const pendingCookies: PendingCookie[] = []
  const pendingHeaders: Record<string, string> = {}
  const { url, key } = supabaseEnv()

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        pendingCookies.splice(0, pendingCookies.length, ...cookiesToSet)
        Object.assign(pendingHeaders, headers)
        supabaseResponse = NextResponse.next({ request })
        applySessionCookies(supabaseResponse, cookiesToSet, headers)
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  if (!user && path.startsWith('/pacientes')) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    return applySessionCookies(NextResponse.redirect(redirectUrl), pendingCookies, pendingHeaders)
  }

  if (!user && path.startsWith('/api')) {
    return applySessionCookies(
      NextResponse.json({ error: 'No has iniciado sesión' }, { status: 401 }),
      pendingCookies,
      pendingHeaders,
    )
  }

  if (user && path === '/login') {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/pacientes'
    return applySessionCookies(NextResponse.redirect(redirectUrl), pendingCookies, pendingHeaders)
  }

  return supabaseResponse
}
