import { NextResponse } from 'next/server'
import type { Role } from '@/lib/domain'
import { updatePatientSchema } from '@/lib/validation'
import { context, isOwner, jsonError, parseBody, requireRole, respond, type AppClient } from '@/lib/api/guard'
import { mapPatientDetail, type PatientRow } from '@/lib/api/map'

type Context = { params: Promise<{ id: string }> }

async function loadPatient(supabase: AppClient, patientId: string, role: Role) {
  const { data, error } = await supabase
    .from('patients')
    .select('id, full_name, template_key')
    .eq('id', patientId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return mapPatientDetail(data as PatientRow, role)
}

export async function GET(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const patient = await loadPatient(session.supabase, id, access.role)
    if (!patient) return jsonError('No encontramos ese paciente', 404)
    return NextResponse.json(patient)
  })
}

export async function PATCH(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) {
      return jsonError('Solo el dueño puede editar el paciente', 403)
    }

    const body = await parseBody(request, updatePatientSchema)
    if ('response' in body) return body.response

    const { data, error } = await session.supabase
      .from('patients')
      .update({ full_name: body.data.fullName })
      .eq('id', id)
      .select('id, full_name, template_key')
      .maybeSingle()
    if (error) throw error
    if (!data) return jsonError('No encontramos ese paciente', 404)
    return NextResponse.json(mapPatientDetail(data as PatientRow, access.role))
  })
}

export async function DELETE(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!isOwner(access.role)) {
      return jsonError('Solo el dueño puede eliminar el paciente', 403)
    }

    const { data, error } = await session.supabase.from('patients').delete().eq('id', id).select('id')
    if (error) throw error
    if (!data?.length) return jsonError('No encontramos ese paciente', 404)
    return NextResponse.json({ ok: true })
  })
}
