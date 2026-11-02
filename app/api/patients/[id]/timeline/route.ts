import { NextRequest, NextResponse } from 'next/server'
import { APPOINTMENT_COLUMNS, mapAppointment, type AppointmentRow } from '@/lib/appointments/map'
import { STATUS_LABEL } from '@/lib/appointments/ordering'
import { context, jsonError, requireRole, respond, type AppClient } from '@/lib/api/guard'
import { asRows, mapSlot, normalizeDate, SLOT_COLUMNS, type SlotRow } from '@/lib/api/map'
import { loadPeople, PeopleMissingError } from '@/lib/api/people'
import { loadExpenses } from '@/lib/api/expenses'
import { loadSituation, SituationMissingError } from '@/lib/api/care-situation'
import { expenseHorizon, expenseStats, EXPENSE_DETAIL_LABEL, formatPesos } from '@/lib/expenses/expense'
import { mapPressure, type PressureRow } from '@/lib/pressure/map'
import type { CareSituation } from '@/lib/care/situation'
import { todayISO } from '@/lib/schedule/dates'
import { type TimelineEvent } from '@/lib/timeline/events'
import { parseRange } from '@/lib/timeline/range'
import {
  appointmentCounts,
  coverageStats,
  dailyDoses,
  pressureSeries,
  type CoverageRecord,
} from '@/lib/timeline/stats'
import { localDateTimeToUtc, utcToLocalDateTime } from '@/lib/time/zoned'

type Context = { params: Promise<{ id: string }> }

type CoverageRow = { id: string; person_id: string; covered_on: string; hour: number }

const PAGE_SIZE = 1000

async function loadCoverage(supabase: AppClient, patientId: string, from: string, to: string) {
  let names: Map<string, string>
  try {
    names = new Map((await loadPeople(supabase, patientId)).map((person) => [person.id, person.name]))
  } catch (error) {
    if (error instanceof PeopleMissingError) return null
    throw error
  }
  const seen = new Set<string>()
  const records: CoverageRecord[] = []
  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await supabase
      .from('care_coverages')
      .select('id, person_id, covered_on, hour')
      .eq('patient_id', patientId)
      .gte('covered_on', from)
      .lte('covered_on', to)
      .order('covered_on', { ascending: true })
      .order('hour', { ascending: true })
      .order('person_id', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (error) return null
    const batch = asRows<CoverageRow>(data)
    if (batch.length === 0 || (batch[0] && seen.has(batch[0].id))) break
    for (const row of batch) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      records.push({
        personId: row.person_id,
        coveredOn: normalizeDate(row.covered_on) ?? row.covered_on,
        hour: row.hour,
        caregiverName: names.get(row.person_id) ?? 'Cuidador',
      })
    }
    if (batch.length < PAGE_SIZE) break
  }
  return records
}

export async function GET(request: NextRequest, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const today = todayISO()
    const range = parseRange(
      request.nextUrl.searchParams.get('from'),
      request.nextUrl.searchParams.get('to'),
      today,
    )
    if ('error' in range) return jsonError(range.error, 400)

    const fromInstant = localDateTimeToUtc(`${range.from}T00:00`)
    const toInstant = localDateTimeToUtc(`${range.to}T23:59`)
    const todayStart = localDateTimeToUtc(`${today}T00:00`)

    const [slotsResult, marksResult, pressureResult, appointmentsResult, nextResult, coverage, situation, expenses] = await Promise.all([
      session.supabase
        .from('medication_slots')
        .select(`${SLOT_COLUMNS}, created_at`)
        .eq('patient_id', id),
      session.supabase
        .from('dose_marks')
        .select('slot_id, taken_on, profiles(full_name, email)')
        .eq('patient_id', id)
        .gte('taken_on', range.from)
        .lte('taken_on', range.to),
      session.supabase
        .from('blood_pressure_readings')
        .select('id, patient_id, measured_at, systolic, diastolic, pulse, day_part, reading_order, note, profiles(full_name, email)')
        .eq('patient_id', id)
        .gte('measured_at', fromInstant)
        .lte('measured_at', toInstant),
      session.supabase
        .from('appointments')
        .select(APPOINTMENT_COLUMNS)
        .eq('patient_id', id)
        .gte('starts_at', fromInstant)
        .lte('starts_at', toInstant),
      session.supabase
        .from('appointments')
        .select(APPOINTMENT_COLUMNS)
        .eq('patient_id', id)
        .eq('status', 'programada')
        .gte('starts_at', todayStart)
        .order('starts_at', { ascending: true })
        .limit(1),
      loadCoverage(session.supabase, id, range.from, range.to),
      loadSituation(session.supabase, id).catch((error: unknown) => {
        if (error instanceof SituationMissingError) return null
        throw error
      }),
      loadExpenses(session.supabase, id),
    ])

    for (const result of [slotsResult, marksResult, pressureResult, appointmentsResult, nextResult]) {
      if (result.error) throw result.error
    }

    const slotRows = asRows<SlotRow & { created_at: string }>(slotsResult.data)
    const slots = slotRows.map(mapSlot)
    const slotById = new Map(slots.map((slot) => [slot.id, slot]))
    const marks = asRows<{ slot_id: string; taken_on: string; profiles: unknown }>(marksResult.data)
    const readings = asRows<PressureRow>(pressureResult.data).map(mapPressure)
    const appointments = asRows<AppointmentRow>(appointmentsResult.data).map(mapAppointment)

    const events: TimelineEvent[] = []

    for (const mark of marks) {
      const slot = slotById.get(mark.slot_id)
      const takenOn = mark.taken_on.slice(0, 10)
      const hour = slot?.hour ?? '12:00'
      const at = localDateTimeToUtc(`${takenOn}T${hour}`)
      events.push({
        id: `dose-${mark.slot_id}-${takenOn}`,
        at,
        localDate: takenOn,
        kind: 'dose',
        time: hour,
        title: slot?.name ?? 'Medicamento',
        detail: slot?.dose ?? '',
        medication: slot?.name,
        amount: slot?.dose,
      })
    }

    for (const reading of readings) {
      const local = utcToLocalDateTime(reading.measuredAt)
      events.push({
        id: `pressure-${reading.id}`,
        at: reading.measuredAt,
        localDate: local.date,
        kind: 'pressure',
        time: local.time,
        title: `${reading.systolic}/${reading.diastolic} mmHg`,
        detail: reading.pulse ? `Pulso ${reading.pulse}` : '',
        systolic: reading.systolic,
        diastolic: reading.diastolic,
        pulse: reading.pulse,
      })
    }

    for (const appointment of appointments) {
      const local = utcToLocalDateTime(appointment.startsAt)
      events.push({
        id: `appointment-${appointment.id}`,
        at: appointment.startsAt,
        localDate: local.date,
        kind: 'appointment',
        time: local.time,
        title: appointment.professionalName,
        detail: [appointment.place, STATUS_LABEL[appointment.status], appointment.companion].filter(Boolean).join(' · '),
        place: appointment.place,
        statusLabel: STATUS_LABEL[appointment.status],
        companion: appointment.companion,
      })
    }
    if (expenses) {
      const horizon = expenseHorizon(range.from, range.to)
      for (const expense of expenses) {
        if (expense.payment === 'cubierto') continue
        if (expense.spentOn < horizon.from || expense.spentOn > horizon.to) continue
        events.push({
          id: `expense-${expense.id}`,
          at: localDateTimeToUtc(`${expense.spentOn}T12:00`),
          localDate: expense.spentOn,
          kind: 'expense',
          title: EXPENSE_DETAIL_LABEL[expense.detail],
          detail: expense.buyerName,
          time: formatPesos(expense.amount),
          money: expense.amount,
          payment: expense.payment,
          buyerName: expense.buyerName,
        })
      }
    }

    const nextRow = asRows<AppointmentRow>(nextResult.data)[0]
    const care = situation as CareSituation | null
    const doses = dailyDoses(
      slotRows.map((row) => ({ ...mapSlot(row), createdOn: utcToLocalDateTime(row.created_at).date })),
      marks.map((mark) => ({ slotId: mark.slot_id, takenOn: mark.taken_on.slice(0, 10) })),
      range.from,
      range.to,
      care,
    )

    return NextResponse.json({
      from: range.from,
      to: range.to,
      today,
      role: access.role,
      doses,
      pressure: pressureSeries(readings),
      appointments: appointmentCounts(appointments),
      coverage: coverage ? coverageStats(coverage, range.from, range.to, care) : null,
      expenses: expenses ? expenseStats(expenses, range.from, range.to, today) : null,
      coverage: coverage ? coverageStats(coverage, range.from, range.to, care) : null,
      nextAppointment: nextRow ? mapAppointment(nextRow) : null,
      events,
    })
  })
}
