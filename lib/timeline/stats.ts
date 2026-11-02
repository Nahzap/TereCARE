import type { SlotKind } from '../domain'
import { APPOINTMENT_STATUSES, type AppointmentStatus } from '../appointments/ordering'
import { dayCare, type CareDayKind, type CareSituation } from '../care/situation'
import { HOURS_IN_DAY } from '../coverage/schedule'
import { doseState, replacesLookup, takenSet } from '../schedule/dose-state'
import { addDays } from '../schedule/dates'

const MAX_DAYS = 400

type StatSlot = {
  id: string
  kind: SlotKind
  endDate: string | null
  startsOn?: string | null
  replacedOn?: string | null
  replacesSlotId?: string | null
  createdOn?: string | null
}

type StatMark = { slotId: string; takenOn: string }

export type DayDoses = { day: string; done: number; total: number; sos: number; care: CareDayKind }

export type PressurePoint = {
  at: string
  systolic: number
  diastolic: number
  pulse: number | null
}

export type AppointmentCount = { status: AppointmentStatus; count: number }

export type CoverageRecord = { personId: string; coveredOn: string; hour: number; caregiverName: string }

export type CoverageDay = { day: string; covered: number; shared: number; care: CareDayKind }

export type CoveragePerson = { personId: string; name: string; hours: number }

export type CoverageStats = {
  totalHours: number
  coveredHours: number
  sharedHours: number
  days: CoverageDay[]
  people: CoveragePerson[]
}

export function rangeDays(from: string, to: string) {
  const days: string[] = []
  let cursor = from
  while (cursor <= to && days.length < MAX_DAYS) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}

export function dailyDoses(
  slots: readonly StatSlot[],
  marks: readonly StatMark[],
  from: string,
  to: string,
  situation: CareSituation | null = null,
): DayDoses[] {
  const taken = takenSet(marks)
  const replacesOf = replacesLookup(slots)
  const sosIds = new Set(slots.filter((slot) => slot.kind === 'sos').map((slot) => slot.id))
  const sosByDay = new Map<string, number>()
  for (const mark of marks) {
    if (sosIds.has(mark.slotId)) sosByDay.set(mark.takenOn, (sosByDay.get(mark.takenOn) ?? 0) + 1)
  }

  return rangeDays(from, to).map((day) => {
    const care = dayCare(situation, day)
    if (care !== 'home') return { day, done: 0, total: 0, sos: 0, care }
    let done = 0
    let total = 0
    for (const slot of slots) {
      if (slot.kind === 'sos') continue
      const state = doseState(slot, day, taken, replacesOf)
      if (state !== 'pending' && state !== 'taken') continue
      if (state === 'pending' && slot.createdOn && day < slot.createdOn) continue
      total += 1
      if (state === 'taken') done += 1
    }
    return { day, done, total, sos: sosByDay.get(day) ?? 0, care }
  })
}

export function pressureSeries(
  readings: readonly { measuredAt: string; systolic: number; diastolic: number; pulse: number | null }[],
): PressurePoint[] {
  return [...readings]
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .map((reading) => ({
      at: reading.measuredAt,
      systolic: reading.systolic,
      diastolic: reading.diastolic,
      pulse: reading.pulse ?? null,
    }))
}

export function appointmentCounts(appointments: readonly { status: AppointmentStatus }[]): AppointmentCount[] {
  return APPOINTMENT_STATUSES.map((status) => ({
    status,
    count: appointments.filter((appointment) => appointment.status === status).length,
  }))
}

export function coverageStats(
  records: readonly CoverageRecord[],
  from: string,
  to: string,
  situation: CareSituation | null = null,
): CoverageStats {
  const days = rangeDays(from, to)
  const inRange = new Set(days)
  const peopleByCell = new Map<string, Set<string>>()
  const people = new Map<string, CoveragePerson>()

  for (const record of records) {
    if (dayCare(situation, record.coveredOn) !== 'home') continue
    if (!inRange.has(record.coveredOn) || record.hour < 0 || record.hour >= HOURS_IN_DAY) continue
    const cell = `${record.coveredOn}|${record.hour}`
    const present = peopleByCell.get(cell) ?? new Set<string>()
    if (present.has(record.personId)) continue
    present.add(record.personId)
    peopleByCell.set(cell, present)
    const person = people.get(record.personId) ?? { personId: record.personId, name: record.caregiverName, hours: 0 }
    person.hours += 1
    if (record.caregiverName) person.name = record.caregiverName
    people.set(record.personId, person)
  }

  const perDay = new Map<string, CoverageDay>(
    days.map((day) => [day, { day, covered: 0, shared: 0, care: dayCare(situation, day) }]),
  )
  for (const [cell, present] of peopleByCell) {
    const entry = perDay.get(cell.slice(0, 10))
    if (!entry) continue
    entry.covered += 1
    if (present.size > 1) entry.shared += 1
  }

  const dayList = days.map((day) => perDay.get(day) ?? { day, covered: 0, shared: 0, care: dayCare(situation, day) })
  const homeDays = dayList.filter((day) => day.care === 'home')
  return {
    totalHours: homeDays.length * HOURS_IN_DAY,
    coveredHours: homeDays.reduce((sum, day) => sum + day.covered, 0),
    sharedHours: homeDays.reduce((sum, day) => sum + day.shared, 0),
    days: dayList,
    people: [...people.values()].sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'es')),
  }
}
