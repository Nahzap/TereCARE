import { NextResponse } from 'next/server'
import { passwordBodySchema } from '@/lib/auth/access'
import { accountError, passwordError } from '@/lib/auth/password'
import { context, jsonError, parseBody, respond } from '@/lib/api/guard'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const body = await parseBody(request, passwordBodySchema)
    if ('response' in body) return body.response

    const nextError = passwordError(body.data.nextPassword, 'La contraseña nueva')
    if (nextError) return jsonError(nextError, 400)

    const email = session.user.email?.trim()
    if (!email) return jsonError('Tu cuenta no tiene correo para verificar la contraseña', 400)

    const currentPassword = body.data.currentPassword?.trim() ?? ''
    if (currentPassword) {
      const verifier = await createClient()
      const check = await verifier.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (check.error) return jsonError('La contraseña actual no es correcta', 400)
    }

    const updated = await session.supabase.auth.updateUser({ password: body.data.nextPassword })
    if (updated.error) {
      return jsonError(
        accountError(updated.error.message) ||
          passwordError(body.data.nextPassword) ||
          updated.error.message,
        400,
      )
    }

    return NextResponse.json({ ok: true })
  })
}
