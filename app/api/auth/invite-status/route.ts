import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inviteCheckSchema } from '@/lib/auth/access'
import { jsonError, parseBody, respond } from '@/lib/api/guard'

export async function POST(request: Request) {
  return respond(async () => {
    const body = await parseBody(request, inviteCheckSchema)
    if ('response' in body) return body.response

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('email_may_join', { p_email: body.data.email })
    if (error) {
      const message = error.message ?? ''
      if (
        error.code === 'PGRST202' ||
        error.code === '42883' ||
        message.includes('email_may_join') ||
        message.includes('schema cache')
      ) {
        return jsonError(
          'El acceso por invitación todavía no está listo en la base. Aplica la migración auth_invite_only.',
          503,
        )
      }
      throw error
    }

    return NextResponse.json({ email: body.data.email, allowed: data === true })
  })
}
