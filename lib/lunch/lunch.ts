import { dayCare, type CareSituation } from '@/lib/care/situation'
import { formatPesos } from '@/lib/expenses/expense'
import { addDays } from '@/lib/schedule/dates'

export const DEFAULT_LUNCH_RATE_CLP = 9000
export const DEFAULT_LUNCH_HOURS = 1.5
export const LUNCH_RATE_MAX = 999_999
export const LUNCH_HOURS_MIN = 0.25
export const LUNCH_HOURS_MAX = 24
export const LUNCH_PEOPLE_MAX = 2
export const LUNCH_DAY_LIMIT = 120

export type LunchRateRow = {
  id: string
  dayRateClp: number
  hoursPerDay: number
  effectiveFrom: string
}

export type LunchSlot = {
  personId: string
  caregiverName: string
  lunchOn: string
  rateClp?: number
  hours?: number
}

export type ValuedLunch = {
  personId: string
  caregiverName: string
  lunchOn: string
  rateClp: number
  hours: number
}

export type LunchChange = {
  personId: string
  assigned: boolean
  days: string[]
}

export type LunchBrush = {
  personId: string | null
  mode: 'paint' | 'erase'
}

export type LunchLine = {
  key: string
  label: string
  color: string
  amount: number
  days: number
  hours: number
}

export type LunchDay = {
  day: string
  total: number
  amounts: Record<string, number>
}

export type LunchStats = {
  from: string
  to: string
  amount: number
  days: number
  hours: number
  currentRateClp: number
  currentHours: number
  lines: LunchLine[]
  cumulativeDays: LunchDay[]
}

const LINE_COLORS = ['#a16207', '#1d4ed8', '#0f766e', '#c2410c', '#7c3aed', '#be123c', '#0369a1', '#334155']

function walkDays(from: string, to: string) {
  const days: string[] = []
  let cursor = from
  while (cursor <= to && days.length < 400) {
    days.push(cursor)
    const next = addDays(cursor, 1)
    if (next <= cursor) break
    cursor = next
  }
  return days
}

export function currentLunchRate(rates: readonly LunchRateRow[], on: string): Pick<LunchRateRow, 'dayRateClp' | 'hoursPerDay'> {
  let dayRateClp = DEFAULT_LUNCH_RATE_CLP
  let hoursPerDay = DEFAULT_LUNCH_HOURS
  for (const rate of [...rates].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))) {
    if (rate.effectiveFrom <= on) {
      dayRateClp = rate.dayRateClp
      hoursPerDay = rate.hoursPerDay
    }
  }
  return { dayRateClp, hoursPerDay }
}

export function formatLunchRate(rateClp: number, hoursPerDay = DEFAULT_LUNCH_HOURS) {
  const hours = Number.isInteger(hoursPerDay) ? String(hoursPerDay) : hoursPerDay.toFixed(1).replace(/\.0$/, '')
  return `${formatPesos(rateClp)}/día · ${hours} h`
}

export function lunchDiff(saved: readonly LunchSlot[], draft: readonly LunchSlot[]): LunchChange[] {
  function grouped(slots: readonly LunchSlot[]) {
    const map = new Map<string, Set<string>>()
    for (const slot of slots) {
      const held = map.get(slot.personId) ?? new Set<string>()
      held.add(slot.lunchOn)
      map.set(slot.personId, held)
    }
    return map
  }

  const before = grouped(saved)
  const after = grouped(draft)
  const people = [...new Set([...before.keys(), ...after.keys()])].sort()
  const changes: LunchChange[] = []
  for (const personId of people) {
    const oldKeys = before.get(personId) ?? new Set<string>()
    const newKeys = after.get(personId) ?? new Set<string>()
    const added = [...newKeys].filter((day) => !oldKeys.has(day)).sort()
    const removed = [...oldKeys].filter((day) => !newKeys.has(day)).sort()
    if (removed.length > 0) changes.push({ personId, assigned: false, days: removed })
    if (added.length > 0) changes.push({ personId, assigned: true, days: added })
  }
  return changes
}

export function applyLunchChanges(
  current: readonly LunchSlot[],
  changes: readonly LunchChange[],
  names: ReadonlyMap<string, string>,
): LunchSlot[] {
  let slots = [...current]
  for (const change of changes) {
    const days = new Set(change.days)
    slots = slots.filter((slot) => slot.personId !== change.personId || !days.has(slot.lunchOn))
    if (change.assigned) {
      const caregiverName = names.get(change.personId) ?? 'Cuidador'
      for (const lunchOn of change.days) {
        slots.push({ personId: change.personId, caregiverName, lunchOn })
      }
    }
  }
  return slots
}

/** Apply a horizontal brush over lunch days, capping at LUNCH_PEOPLE_MAX per day. */
export function lunchBrushChanges(
  current: readonly LunchSlot[],
  days: readonly string[],
  brush: LunchBrush,
): { changes: LunchChange[]; skippedFull: boolean } {
  if (days.length === 0) return { changes: [], skippedFull: false }

  if (brush.personId == null) {
    const byPerson = new Map<string, string[]>()
    for (const slot of current) {
      if (!days.includes(slot.lunchOn)) continue
      const list = byPerson.get(slot.personId) ?? []
      list.push(slot.lunchOn)
      byPerson.set(slot.personId, list)
    }
    return {
      changes: [...byPerson].map(([personId, held]) => ({
        personId,
        assigned: false,
        days: [...new Set(held)].sort(),
      })),
      skippedFull: false,
    }
  }

  const personId = brush.personId
  let skippedFull = false
  const paintDays: string[] = []
  const eraseDays: string[] = []

  for (const day of days) {
    const onDay = current.filter((slot) => slot.lunchOn === day)
    const holds = onDay.some((slot) => slot.personId === personId)
    if (brush.mode === 'erase') {
      if (holds) eraseDays.push(day)
      continue
    }
    if (holds) continue
    const others = onDay.filter((slot) => slot.personId !== personId).length
    if (others >= LUNCH_PEOPLE_MAX) {
      skippedFull = true
      continue
    }
    paintDays.push(day)
  }

  const changes: LunchChange[] = []
  if (brush.mode === 'paint' && paintDays.length > 0) {
    changes.push({ personId, assigned: true, days: paintDays })
  }
  if (brush.mode === 'erase' && eraseDays.length > 0) {
    changes.push({ personId, assigned: false, days: eraseDays })
  }
  return { changes, skippedFull }
}

export function lunchStats(input: {
  from: string
  to: string
  today: string
  lunches: readonly ValuedLunch[]
  rates: readonly LunchRateRow[]
  situation?: CareSituation | null
}): LunchStats {
  const days = walkDays(input.from, input.to)
  const inWindow = new Set(days)
  const amountByPersonDay = new Map<string, Map<string, number>>()
  const daysByPerson = new Map<string, number>()
  const hoursByPerson = new Map<string, number>()
  const names = new Map<string, string>()

  for (const lunch of input.lunches) {
    if (dayCare(input.situation ?? null, lunch.lunchOn) !== 'home') continue
    if (!inWindow.has(lunch.lunchOn)) continue
    const rate = lunch.rateClp > 0 ? lunch.rateClp : currentLunchRate(input.rates, lunch.lunchOn).dayRateClp
    const hours = lunch.hours > 0 ? lunch.hours : currentLunchRate(input.rates, lunch.lunchOn).hoursPerDay
    names.set(lunch.personId, lunch.caregiverName)
    const byDay = amountByPersonDay.get(lunch.personId) ?? new Map<string, number>()
    byDay.set(lunch.lunchOn, (byDay.get(lunch.lunchOn) ?? 0) + rate)
    amountByPersonDay.set(lunch.personId, byDay)
    daysByPerson.set(lunch.personId, (daysByPerson.get(lunch.personId) ?? 0) + 1)
    hoursByPerson.set(lunch.personId, (hoursByPerson.get(lunch.personId) ?? 0) + hours)
  }

  const draft = [...amountByPersonDay.keys()].map((personId) => {
    let amount = 0
    for (const value of amountByPersonDay.get(personId)?.values() ?? []) amount += value
    return {
      key: personId,
      label: names.get(personId) ?? 'Cuidador',
      amount,
      days: daysByPerson.get(personId) ?? 0,
      hours: hoursByPerson.get(personId) ?? 0,
    }
  })
  draft.sort((left, right) => right.amount - left.amount || left.label.localeCompare(right.label, 'es'))

  const lines: LunchLine[] = draft.map((person, index) => ({
    ...person,
    color: LINE_COLORS[index % LINE_COLORS.length] ?? '#a16207',
  }))

  const running = new Map(lines.map((line) => [line.key, 0]))
  const cumulativeDays: LunchDay[] = days.map((day) => {
    const amounts: Record<string, number> = {}
    let total = 0
    for (const line of lines) {
      const delta = amountByPersonDay.get(line.key)?.get(day) ?? 0
      const next = (running.get(line.key) ?? 0) + delta
      running.set(line.key, next)
      amounts[line.key] = next
      total += next
    }
    return { day, total, amounts }
  })

  const current = currentLunchRate(input.rates, input.today)
  return {
    from: input.from,
    to: input.to,
    amount: lines.reduce((sum, line) => sum + line.amount, 0),
    days: lines.reduce((sum, line) => sum + line.days, 0),
    hours: lines.reduce((sum, line) => sum + line.hours, 0),
    currentRateClp: current.dayRateClp,
    currentHours: current.hoursPerDay,
    lines,
    cumulativeDays,
  }
}
