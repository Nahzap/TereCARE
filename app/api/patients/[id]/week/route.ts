import { NextRequest, NextResponse } from 'next/server'
import { isMonday, mondayOf, sortSlots, todayISO, weekDays } from '@/lib/schedule/dates'
import { isoDateSchema } from '@/lib/validation'
import type { WeekPayload } from '@/lib/domain'
import { context, jsonError, requireRole, respond } from '@/lib/api/guard'
import { asRows, mapMark, mapPatientDetail, mapSlot, SLOT_COLUMNS, type PatientRow, type SlotRow } from '@/lib/api/map'

type Context = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const mondayParam = request.nextUrl.searchParams.get('monday')
    let monday: string
    if (mondayParam == null) {
      monday = mondayOf(todayISO())
    } else if (!isoDateSchema.safeParse(mondayParam).success || !isMonday(mondayParam)) {
      return jsonError('La semana debe empezar en lunes', 400)
    } else {
      monday = mondayParam
    }

    const days = weekDays(monday)
    const start = days[0]
    const end = days[6]
    if (!start || !end) throw new Error('Semana inválida')

    const [patientResult, slotResult, markResult] = await Promise.all([
      session.supabase.from('patients').select('id, full_name, template_key').eq('id', id).maybeSingle(),
      session.supabase
        .from('medication_slots')
        .select(SLOT_COLUMNS)
        .eq('patient_id', id),
      session.supabase
        .from('dose_marks')
        .select('slot_id, taken_on, profiles(full_name, email)')
        .eq('patient_id', id)
        .gte('taken_on', start)
        .lte('taken_on', end),
    ])

    if (patientResult.error) throw patientResult.error
    if (slotResult.error) throw slotResult.error
    if (markResult.error) throw markResult.error
    if (!patientResult.data) return jsonError('No encontramos ese paciente', 404)

    const payload: WeekPayload = {
      patient: mapPatientDetail(patientResult.data as PatientRow, access.role),
      monday,
      days,
      slots: sortSlots(asRows<SlotRow>(slotResult.data).map(mapSlot)),
      marks: asRows<{ slot_id: string; taken_on: string; profiles: unknown }>(markResult.data).map(
        mapMark,
      ),
    }
    return NextResponse.json(payload)
  })
}
