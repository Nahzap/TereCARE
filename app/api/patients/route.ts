import { NextResponse } from 'next/server'
import { TERESA_SLOTS } from '@/lib/schedule/template-teresa'
import { doseState, replacesLookup, takenSet } from '@/lib/schedule/dose-state'
import { todayISO } from '@/lib/schedule/dates'
import type { PatientListItem } from '@/lib/domain'
import { createPatientSchema } from '@/lib/validation'
import { asRole, context, parseBody, respond } from '@/lib/api/guard'
import { asRows, embedded, normalizeDate } from '@/lib/api/map'

type PatientEmbed = {
  id: string
  full_name: string
  template_key: string | null
}

type MembershipRow = {
  role: string
  patients: unknown
}

type CountSlot = {
  id: string
  patient_id: string
  kind: string
  end_date: string | null
  starts_on: string | null
  replaced_on: string | null
  replaces_slot_id: string | null
}

export async function GET() {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { supabase, user } = session

    const membershipResult = await supabase
      .from('patient_members')
      .select('role, patients(id, full_name, template_key)')
      .eq('user_id', user.id)
    if (membershipResult.error) throw membershipResult.error

    const today = todayISO()
    const patients = asRows<MembershipRow>(membershipResult.data).flatMap((row) => {
      const patient = embedded<PatientEmbed>(row.patients)
      if (!patient) return []
      const role = asRole(row.role)
      if (!role) throw new Error('Rol de miembro desconocido')
      return [{ patient, role }]
    })

    const progress = new Map<string, { done: number; total: number }>()
    const ids = patients.map((item) => item.patient.id)

    if (ids.length > 0) {
      const slotResult = await supabase
        .from('medication_slots')
        .select('id, patient_id, kind, end_date, starts_on, replaced_on, replaces_slot_id')
        .in('patient_id', ids)
      if (slotResult.error) throw slotResult.error

      const slots = asRows<CountSlot>(slotResult.data)
      const slotIds = slots.map((slot) => slot.id)
      const marks: { slot_id: string }[] = []
      if (slotIds.length > 0) {
        const markResult = await supabase
          .from('dose_marks')
          .select('slot_id')
          .in('slot_id', slotIds)
          .eq('taken_on', today)
        if (markResult.error) throw markResult.error
        marks.push(...asRows<{ slot_id: string }>(markResult.data))
      }

      const taken = takenSet(marks.map((mark) => ({ slotId: mark.slot_id, takenOn: today })))
      const byPatient = new Map<string, CountSlot[]>()
      for (const slot of slots) {
        const list = byPatient.get(slot.patient_id) ?? []
        list.push(slot)
        byPatient.set(slot.patient_id, list)
      }

      for (const [patientId, patientSlots] of byPatient) {
        const replacesOf = replacesLookup(
          patientSlots.map((slot) => ({ id: slot.id, replacesSlotId: slot.replaces_slot_id })),
        )
        let done = 0
        let total = 0
        for (const slot of patientSlots) {
          if (slot.kind === 'sos') continue
          const state = doseState(
            {
              id: slot.id,
              startsOn: normalizeDate(slot.starts_on),
              endDate: normalizeDate(slot.end_date),
              replacedOn: normalizeDate(slot.replaced_on),
              replacesSlotId: slot.replaces_slot_id,
            },
            today,
            taken,
            replacesOf,
          )
          if (state !== 'pending' && state !== 'taken') continue
          total += 1
          if (state === 'taken') done += 1
        }
        progress.set(patientId, { done, total })
      }
    }

    const items: PatientListItem[] = patients.map(({ patient, role }) => {
      const counts = progress.get(patient.id) ?? { done: 0, total: 0 }
      return {
        id: patient.id,
        fullName: patient.full_name,
        templateKey: patient.template_key ?? null,
        role,
        todayFixedDone: counts.done,
        todayFixedTotal: counts.total,
      }
    })

    items.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' }))
    return NextResponse.json(items)
  })
}

export async function POST(request: Request) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response

    const body = await parseBody(request, createPatientSchema)
    if ('response' in body) return body.response

    const templateKey = body.data.templateKey ?? null
    const slots = templateKey === 'teresa' ? TERESA_SLOTS : []
    const { data, error } = await session.supabase.rpc('create_patient_with_slots', {
      p_full_name: body.data.fullName,
      p_template_key: templateKey ?? '',
      p_slots: slots,
    })
    if (error) throw error
    if (typeof data !== 'string' || data.length === 0) {
      throw new Error('create_patient_with_slots no devolvió un id')
    }

    return NextResponse.json({ id: data }, { status: 201 })
  })
}
