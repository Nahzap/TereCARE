import { NextResponse } from 'next/server'
import { context, isOwner, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { PEOPLE_MISSING, peopleSchemaMissing } from '@/lib/api/people'
import { personMergeSchema } from '@/lib/coverage/people'

type Context = { params: Promise<{ id: string; personId: string }> }

const KNOWN = [
  'Elige a otra persona para fusionar',
  'No encontramos a esa persona',
  'Solo se puede fusionar a una persona sin cuenta',
  'Esa persona ya no es cuidadora',
]

function count(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0
}

export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id, personId } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) return jsonError('Solo el dueño puede fusionar personas', 403)

    const body = await parseBody(request, personMergeSchema)
    if ('response' in body) return body.response

    const { data, error } = await session.supabase.rpc('merge_care_people', {
      p_patient_id: id,
      p_source_id: personId,
      p_target_id: body.data.targetId,
    })
    if (peopleSchemaMissing(error)) return jsonError(PEOPLE_MISSING, 503)
    if (error) {
      const known = KNOWN.find((message) => (error.message ?? '').includes(message))
      if (known) return jsonError(known, 400)
      throw error
    }

    const result = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    return NextResponse.json({ moved: count(result.moved), duplicates: count(result.duplicates) })
  })
}
