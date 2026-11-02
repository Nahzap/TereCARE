import { NextResponse } from 'next/server'
import { sortSlots } from '@/lib/schedule/dates'
import { slotBodySchema } from '@/lib/validation'
import { canEdit, context, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { asRows, mapSlot, SLOT_COLUMNS, slotWrite, type SlotRow } from '@/lib/api/map'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const { data, error } = await session.supabase
      .from('medication_slots')
      .select(SLOT_COLUMNS)
      .eq('patient_id', id)
    if (error) throw error

    return NextResponse.json(sortSlots(asRows<SlotRow>(data).map(mapSlot)))
  })
}

export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes editar el esquema', 403)

    const body = await parseBody(request, slotBodySchema)
    if ('response' in body) return body.response

    const { data, error } = await session.supabase
      .from('medication_slots')
      .insert({ patient_id: id, ...slotWrite(body.data) })
      .select(SLOT_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('No se pudo crear el medicamento')
    return NextResponse.json(mapSlot(data as SlotRow), { status: 201 })
  })
}
