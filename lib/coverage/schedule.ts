import type { Role } from '@/lib/domain'
import type { CarePerson } from '@/lib/coverage/people'
import type { LunchSlot } from '@/lib/lunch/lunch'
import { addDays, DAY_SHORT, MONTHS } from '@/lib/schedule/dates'

export const COVERAGE_RADIUS_DAYS = 15
export const COVERAGE_FUTURE_DAYS = 90
export const COVERAGE_WEEK_DAYS = 7
const HISTORY_YEARS_BACK = 4
export const HOURS_IN_DAY = 24
/** Lookback for context, today, and the whole planning horizon in one grid. */
const COVERAGE_DAY_COUNT = COVERAGE_RADIUS_DAYS + 1 + COVERAGE_FUTURE_DAYS
export const COVERAGE_SLOT_LIMIT = COVERAGE_DAY_COUNT * HOURS_IN_DAY

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const WEEKDAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const CAREGIVER_COLORS = [
  '#1d4ed8',
  '#047857',
  '#b45309',
  '#6d28d9',
  '#be123c',
  '#0e7490',
  '#4338ca',
  '#3f6212',
] as const

export type HourSlot = {
  coveredOn: string
  hour: number
}

export type CoverageSlot = HourSlot & {
  personId: string
  caregiverName: string
}

type CoverageWindow = {
  today: string
  from: string
  to: string
  days: string[]
}

export type CoveragePayload = CoverageWindow & {
  role: Role
  people: CarePerson[]
  slots: CoverageSlot[]
  lunches: LunchSlot[]
}

export function isAssignableRole(role: Role) {
  return role === 'owner' || role === 'caregiver'
}

/** Owners edit anyone. Caregivers may only change the person linked to their account. */
export function canEditCarePerson(
  role: Role,
  actorUserId: string,
  person: { userId: string | null },
) {
  if (role === 'owner') return true
  if (role === 'caregiver') return person.userId != null && person.userId === actorUserId
  return false
}

export function historyBounds(today: string) {
  const year = Number(today.slice(0, 4))
  return {
    earliest: `${year - HISTORY_YEARS_BACK}-01-01`,
    latest: addDays(today, COVERAGE_FUTURE_DAYS),
  }
}

export function coverageDateBlock(date: string, today: string) {
  const bounds = historyBounds(today)
  if (date > bounds.latest) return 'future' as const
  if (date < bounds.earliest) return 'past' as const
  return null
}

export function clampWindowStart(start: string, today: string) {
  const bounds = historyBounds(today)
  if (start < bounds.earliest) return bounds.earliest
  if (start > bounds.latest) return bounds.latest
  return start
}

export function daysBetween(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  const start = Date.UTC(fromYear ?? 0, (fromMonth ?? 1) - 1, fromDay ?? 1)
  const end = Date.UTC(toYear ?? 0, (toMonth ?? 1) - 1, toDay ?? 1)
  return Math.round((end - start) / 86_400_000)
}

export function shiftCoverageStart(from: string, today: string, days: number) {
  return clampWindowStart(addDays(from, days), today)
}

export function coverageView(today: string, start?: string | null): CoverageWindow {
  const bounds = historyBounds(today)
  const requested = start && ISO_DATE.test(start) ? start : addDays(today, -COVERAGE_RADIUS_DAYS)
  const from = clampWindowStart(requested, today)
  const days: string[] = []
  for (let index = 0; index < COVERAGE_DAY_COUNT; index += 1) {
    const day = addDays(from, index)
    if (day > bounds.latest) break
    days.push(day)
  }
  if (days.length === 0) days.push(from)
  return { today, from: days[0] ?? from, to: days[days.length - 1] ?? from, days }
}

function monthBounds(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { from, to: addDays(next, -1) }
}

export function monthOverlapsHistory(year: number, month: number, today: string) {
  const span = monthBounds(year, month)
  const bounds = historyBounds(today)
  return span.to >= bounds.earliest && span.from <= bounds.latest
}

export const TOTAL_SCOPES = ['window', 'month', 'year', 'all'] as const

export type TotalScope = (typeof TOTAL_SCOPES)[number]

export type CaregiverTotal = {
  personId: string
  name: string
  hours: number
  doneHours: number
  firstOn: string | null
  lastOn: string | null
}

export type CoverageTotals = {
  scope: TotalScope
  from: string
  to: string
  totalHours: number
  coveredHours: number
  sharedHours: number
  people: CaregiverTotal[]
}

export function isTotalScope(value: string | null): value is TotalScope {
  return value != null && (TOTAL_SCOPES as readonly string[]).includes(value)
}

export function totalsRange(scope: TotalScope, window: Pick<CoverageWindow, 'today' | 'from' | 'to' | 'days'>) {
  const bounds = historyBounds(window.today)
  if (scope === 'window') return { from: window.from, to: window.to }
  if (scope === 'all') return { from: bounds.earliest, to: bounds.latest }
  const focus = window.days[Math.floor(window.days.length / 2)] ?? window.from
  const year = Number(focus.slice(0, 4))
  const span = scope === 'year' ? { from: `${year}-01-01`, to: `${year}-12-31` } : monthBounds(year, Number(focus.slice(5, 7)))
  return {
    from: span.from < bounds.earliest ? bounds.earliest : span.from,
    to: span.to > bounds.latest ? bounds.latest : span.to,
  }
}

export function totalsLabel(scope: TotalScope, range: { from: string; to: string }) {
  if (scope === 'all') return 'Todo el historial'
  if (scope === 'year') return range.from.slice(0, 4)
  if (scope === 'month') return `${MONTHS[Number(range.from.slice(5, 7)) - 1] ?? ''} ${range.from.slice(0, 4)}`
  return 'Días a la vista'
}

export function rangeHours(from: string, to: string) {
  if (from > to) return 0
  return (daysBetween(from, to) + 1) * HOURS_IN_DAY
}

function asCount(value: unknown) {
  const count = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0
}

function asDay(value: unknown) {
  return typeof value === 'string' && ISO_DATE.test(value.slice(0, 10)) ? value.slice(0, 10) : null
}

export function readTotals(raw: unknown, scope: TotalScope, range: { from: string; to: string }): CoverageTotals {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const people = (Array.isArray(source.people) ? source.people : [])
    .map((entry): CaregiverTotal | null => {
      if (!entry || typeof entry !== 'object') return null
      const person = entry as Record<string, unknown>
      if (typeof person.personId !== 'string') return null
      const hours = asCount(person.hours)
      return {
        personId: person.personId,
        name: typeof person.name === 'string' && person.name.trim() ? person.name.trim() : 'Cuidador',
        hours,
        doneHours: Math.min(hours, asCount(person.doneHours)),
        firstOn: asDay(person.firstOn),
        lastOn: asDay(person.lastOn),
      }
    })
    .filter((person): person is CaregiverTotal => person !== null)
    .sort((left, right) => right.hours - left.hours || left.name.localeCompare(right.name, 'es'))

  const firstOn = people.reduce<string | null>(
    (earliest, person) => (person.firstOn && (!earliest || person.firstOn < earliest) ? person.firstOn : earliest),
    null,
  )
  const countableDays = asCount(source.countableDays)
  const usesCareRules = typeof source.countableDays === 'number'
  const countedFrom = asDay(source.countedFrom)
  const from = !usesCareRules && scope === 'all' && firstOn && firstOn > range.from ? firstOn : countedFrom ?? range.from
  const totalHours = usesCareRules ? countableDays * HOURS_IN_DAY : scope === 'all' && !firstOn ? 0 : rangeHours(from, range.to)
  const coveredHours = Math.min(totalHours, asCount(source.coveredHours))

  return {
    scope,
    from,
    to: range.to,
    totalHours,
    coveredHours,
    sharedHours: Math.min(coveredHours, asCount(source.sharedHours)),
    people,
  }
}

export function percentOf(part: number, whole: number) {
  if (whole <= 0 || part <= 0) return 0
  if (part >= whole) return 100
  return Math.max(1, Math.min(99, Math.round((part * 100) / whole)))
}

export function formatHours(hours: number) {
  const text = String(Math.trunc(hours)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return hours === 1 ? '1 hora' : `${text} horas`
}

export function slotKey(personId: string, coveredOn: string, hour: number) {
  return `${personId}|${coveredOn}|${String(hour).padStart(2, '0')}`
}

export function dedupeSlots<T extends HourSlot>(slots: readonly T[]) {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const slot of slots) {
    const key = `${slot.coveredOn}|${slot.hour}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(slot)
  }
  return unique
}

export function caregiverColor(index: number) {
  return CAREGIVER_COLORS[index % CAREGIVER_COLORS.length] ?? CAREGIVER_COLORS[0]
}

function weekdayIndex(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function weekdayShort(isoDate: string) {
  const index = weekdayIndex(isoDate)
  const mondayFirst = index === 0 ? 6 : index - 1
  return DAY_SHORT[mondayFirst] ?? ''
}

export function weekdayTitle(isoDate: string) {
  const name = WEEKDAY_LONG[weekdayIndex(isoDate)] ?? ''
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : ''
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`
}

export function formatRange(range: { start: number; end: number }) {
  return `${formatHour(range.start)} a ${formatHour(range.end)}`
}

export function coveredHourCount(slots: readonly HourSlot[], days: readonly string[]) {
  const allowed = new Set(days)
  const covered = new Set<string>()
  for (const slot of slots) {
    if (!allowed.has(slot.coveredOn) || slot.hour < 0 || slot.hour > 23) continue
    covered.add(`${slot.coveredOn}|${slot.hour}`)
  }
  return covered.size
}

export function coverageSummary(covered: number, total: number) {
  if (total === 0) return 'Estos días no entran en el indicador: son anteriores al alta o de hospital.'
  if (covered >= total) return 'Toda la ventana tiene un cuidador en cada hora.'
  if (covered === 0) return 'Nadie está a cargo en estos días. Elige un cuidador y marca las horas.'
  const missing = total - covered
  return missing === 1
    ? `Falta 1 hora sin cuidador. ${covered} de ${total} ya tienen a alguien.`
    : `Faltan ${missing} horas sin cuidador. ${covered} de ${total} ya tienen a alguien.`
}

/** First word of each name. Adds the next word only when two people would look the same. */
export function shortNames(names: readonly string[]) {
  const parts = names.map((name) => name.trim().split(/\s+/).filter(Boolean))
  return parts.map((mine, index) => {
    if (mine.length === 0) return 'Cuidador'
    for (let count = 1; count < mine.length; count += 1) {
      const label = mine.slice(0, count).join(' ')
      const taken = parts.some(
        (other, otherIndex) => otherIndex !== index && other.slice(0, count).join(' ') === label,
      )
      if (!taken) return label
    }
    return mine.join(' ')
  })
}

export function joinNames(names: readonly string[]) {
  if (names.length === 0) return 'Nadie a cargo'
  if (names.length === 1) return names[0] ?? 'Nadie a cargo'
  if (names.length === 2) return `${names[0]} y ${names[1]}`
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

export type HourRect = {
  fromDay: string
  toDay: string
  fromHour: number
  toHour: number
}

export function rectBetween(start: HourSlot, end: HourSlot): HourRect {
  return {
    fromDay: start.coveredOn <= end.coveredOn ? start.coveredOn : end.coveredOn,
    toDay: start.coveredOn <= end.coveredOn ? end.coveredOn : start.coveredOn,
    fromHour: Math.max(0, Math.min(start.hour, end.hour)),
    toHour: Math.min(HOURS_IN_DAY - 1, Math.max(start.hour, end.hour)),
  }
}

export function insideRect(rect: HourRect | null, coveredOn: string, hour: number) {
  return (
    rect != null &&
    coveredOn >= rect.fromDay &&
    coveredOn <= rect.toDay &&
    hour >= rect.fromHour &&
    hour <= rect.toHour
  )
}

export function slotsInRect(days: readonly string[], rect: HourRect): HourSlot[] {
  const result: HourSlot[] = []
  for (const coveredOn of days) {
    if (coveredOn < rect.fromDay || coveredOn > rect.toDay) continue
    for (let hour = rect.fromHour; hour <= rect.toHour; hour += 1) result.push({ coveredOn, hour })
  }
  return result
}

/** `personId: null` clears everyone from the cells. */
export type CoverageBrush = {
  personId: string | null
  mode: 'paint' | 'erase'
}

export type CoverageChange = {
  personId: string
  assigned: boolean
  slots: HourSlot[]
}

export function rectChanges(
  current: readonly CoverageSlot[],
  cells: readonly HourSlot[],
  brush: CoverageBrush,
): CoverageChange[] {
  const wanted = new Set(cells.map((cell) => `${cell.coveredOn}|${cell.hour}`))
  const touched = current.filter((slot) => wanted.has(`${slot.coveredOn}|${slot.hour}`))

  if (brush.personId == null) {
    const byPerson = new Map<string, HourSlot[]>()
    for (const slot of touched) {
      const list = byPerson.get(slot.personId) ?? []
      list.push({ coveredOn: slot.coveredOn, hour: slot.hour })
      byPerson.set(slot.personId, list)
    }
    return [...byPerson].map(([personId, slots]) => ({ personId, assigned: false, slots: dedupeSlots(slots) }))
  }

  const personId = brush.personId
  const held = new Set(
    touched.filter((slot) => slot.personId === personId).map((slot) => `${slot.coveredOn}|${slot.hour}`),
  )
  const slots =
    brush.mode === 'paint'
      ? cells.filter((cell) => !held.has(`${cell.coveredOn}|${cell.hour}`))
      : cells.filter((cell) => held.has(`${cell.coveredOn}|${cell.hour}`))
  return slots.length > 0 ? [{ personId, assigned: brush.mode === 'paint', slots: dedupeSlots(slots) }] : []
}

export function coverageDiff(saved: readonly CoverageSlot[], draft: readonly CoverageSlot[]): CoverageChange[] {
  function grouped(slots: readonly CoverageSlot[]) {
    const map = new Map<string, Set<string>>()
    for (const slot of slots) {
      const held = map.get(slot.personId) ?? new Set<string>()
      held.add(`${slot.coveredOn}|${slot.hour}`)
      map.set(slot.personId, held)
    }
    return map
  }

  const before = grouped(saved)
  const after = grouped(draft)
  const people = [...new Set([...before.keys(), ...after.keys()])].sort()
  const changes: CoverageChange[] = []
  for (const personId of people) {
    const oldKeys = before.get(personId) ?? new Set<string>()
    const newKeys = after.get(personId) ?? new Set<string>()
    const toSlot = (key: string): HourSlot => {
      const [coveredOn, hour] = key.split('|')
      return { coveredOn, hour: Number(hour) }
    }
    const added = [...newKeys].filter((key) => !oldKeys.has(key)).sort().map(toSlot)
    const removed = [...oldKeys].filter((key) => !newKeys.has(key)).sort().map(toSlot)
    if (removed.length > 0) changes.push({ personId, assigned: false, slots: removed })
    if (added.length > 0) changes.push({ personId, assigned: true, slots: added })
  }
  return changes
}

export function applyChanges(
  current: readonly CoverageSlot[],
  changes: readonly CoverageChange[],
  names: ReadonlyMap<string, string>,
): CoverageSlot[] {
  let slots = [...current]
  for (const change of changes) {
    const keys = new Set(change.slots.map((slot) => `${slot.coveredOn}|${slot.hour}`))
    slots = slots.filter(
      (slot) => slot.personId !== change.personId || !keys.has(`${slot.coveredOn}|${slot.hour}`),
    )
    if (change.assigned) {
      const caregiverName = names.get(change.personId) ?? 'Cuidador'
      for (const slot of change.slots) slots.push({ ...slot, personId: change.personId, caregiverName })
    }
  }
  return slots
}
