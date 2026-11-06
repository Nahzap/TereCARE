import { expensePortions, formatPesos, type Expense } from '@/lib/expenses/expense'
import { addDays } from '@/lib/schedule/dates'
import type { CareSituation } from '@/lib/care/situation'
import { dayCare } from '@/lib/care/situation'

export const DEFAULT_HOUR_RATE_CLP = 3500
export const HOUR_RATE_MAX = 999_999

export type HourRateRow = {
  id: string
  rateClp: number
  effectiveFrom: string
}

export type ValuedCoverageHour = {
  personId: string
  caregiverName: string
  coveredOn: string
  rateClp: number
}

export type ContributionLine = {
  key: string
  label: string
  color: string
  money: number
  timeValue: number
  lunchValue: number
  hours: number
  lunchDays: number
  total: number
}

export type ContributionDay = {
  day: string
  total: number
  amounts: Record<string, number>
}

export type ContributionStats = {
  from: string
  to: string
  moneyAmount: number
  timeAmount: number
  lunchAmount: number
  hours: number
  lunchDays: number
  equivalentAmount: number
  currentRateClp: number
  lines: ContributionLine[]
  cumulativeDays: ContributionDay[]
}

export type ValuedLunchDay = {
  personId: string
  caregiverName: string
  lunchOn: string
  rateClp: number
}

const LINE_COLORS = ['#0f766e', '#1d4ed8', '#c2410c', '#7c3aed', '#be123c', '#0369a1', '#a16207', '#334155']

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

export function currentHourRate(rates: readonly HourRateRow[], on: string) {
  let current = DEFAULT_HOUR_RATE_CLP
  for (const rate of [...rates].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))) {
    if (rate.effectiveFrom <= on) current = rate.rateClp
  }
  return current
}

export function formatHourRate(rateClp: number) {
  return `${formatPesos(rateClp)}/h`
}

export function contributionStats(input: {
  from: string
  to: string
  today: string
  expenses: readonly Expense[]
  hours: readonly ValuedCoverageHour[]
  lunches?: readonly ValuedLunchDay[]
  rates: readonly HourRateRow[]
  situation?: CareSituation | null
}): ContributionStats {
  const days = walkDays(input.from, input.to)
  const inWindow = new Set(days)
  const moneyByBuyerDay = new Map<string, Map<string, number>>()
  const timeByBuyerDay = new Map<string, Map<string, number>>()
  const lunchByBuyerDay = new Map<string, Map<string, number>>()
  const hoursByBuyer = new Map<string, number>()
  const lunchDaysByBuyer = new Map<string, number>()
  const names = new Map<string, string>()

  for (const expense of input.expenses) {
    names.set(expense.personId, expense.buyerName)
    for (const portion of expensePortions(expense)) {
      if (!inWindow.has(portion.date)) continue
      const byDay = moneyByBuyerDay.get(expense.personId) ?? new Map<string, number>()
      byDay.set(portion.date, (byDay.get(portion.date) ?? 0) + portion.amount)
      moneyByBuyerDay.set(expense.personId, byDay)
    }
  }

  for (const hour of input.hours) {
    if (dayCare(input.situation ?? null, hour.coveredOn) !== 'home') continue
    if (!inWindow.has(hour.coveredOn)) continue
    const rate = hour.rateClp > 0 ? hour.rateClp : currentHourRate(input.rates, hour.coveredOn)
    names.set(hour.personId, hour.caregiverName)
    const byDay = timeByBuyerDay.get(hour.personId) ?? new Map<string, number>()
    byDay.set(hour.coveredOn, (byDay.get(hour.coveredOn) ?? 0) + rate)
    timeByBuyerDay.set(hour.personId, byDay)
    hoursByBuyer.set(hour.personId, (hoursByBuyer.get(hour.personId) ?? 0) + 1)
  }

  for (const lunch of input.lunches ?? []) {
    if (dayCare(input.situation ?? null, lunch.lunchOn) !== 'home') continue
    if (!inWindow.has(lunch.lunchOn)) continue
    if (lunch.rateClp <= 0) continue
    names.set(lunch.personId, lunch.caregiverName)
    const byDay = lunchByBuyerDay.get(lunch.personId) ?? new Map<string, number>()
    byDay.set(lunch.lunchOn, (byDay.get(lunch.lunchOn) ?? 0) + lunch.rateClp)
    lunchByBuyerDay.set(lunch.personId, byDay)
    lunchDaysByBuyer.set(lunch.personId, (lunchDaysByBuyer.get(lunch.personId) ?? 0) + 1)
  }

  const personIds = new Set([...moneyByBuyerDay.keys(), ...timeByBuyerDay.keys(), ...lunchByBuyerDay.keys()])
  const draft = [...personIds].map((personId) => {
    let money = 0
    let timeValue = 0
    let lunchValue = 0
    for (const amount of moneyByBuyerDay.get(personId)?.values() ?? []) money += amount
    for (const amount of timeByBuyerDay.get(personId)?.values() ?? []) timeValue += amount
    for (const amount of lunchByBuyerDay.get(personId)?.values() ?? []) lunchValue += amount
    return {
      key: personId,
      label: names.get(personId) ?? 'Cuidador',
      money,
      timeValue,
      lunchValue,
      hours: hoursByBuyer.get(personId) ?? 0,
      lunchDays: lunchDaysByBuyer.get(personId) ?? 0,
      total: money + timeValue + lunchValue,
    }
  })
  draft.sort((left, right) => right.total - left.total || left.label.localeCompare(right.label, 'es'))

  const lines: ContributionLine[] = draft.map((person, index) => ({
    ...person,
    color: LINE_COLORS[index % LINE_COLORS.length] ?? '#0f766e',
  }))

  const running = new Map(lines.map((line) => [line.key, 0]))
  const cumulativeDays: ContributionDay[] = days.map((day) => {
    const amounts: Record<string, number> = {}
    let total = 0
    for (const line of lines) {
      const delta =
        (moneyByBuyerDay.get(line.key)?.get(day) ?? 0) +
        (timeByBuyerDay.get(line.key)?.get(day) ?? 0) +
        (lunchByBuyerDay.get(line.key)?.get(day) ?? 0)
      const next = (running.get(line.key) ?? 0) + delta
      running.set(line.key, next)
      amounts[line.key] = next
      total += next
    }
    return { day, total, amounts }
  })

  return {
    from: input.from,
    to: input.to,
    moneyAmount: lines.reduce((sum, line) => sum + line.money, 0),
    timeAmount: lines.reduce((sum, line) => sum + line.timeValue, 0),
    lunchAmount: lines.reduce((sum, line) => sum + line.lunchValue, 0),
    hours: lines.reduce((sum, line) => sum + line.hours, 0),
    lunchDays: lines.reduce((sum, line) => sum + line.lunchDays, 0),
    equivalentAmount: lines.reduce((sum, line) => sum + line.total, 0),
    currentRateClp: currentHourRate(input.rates, input.today),
    lines,
    cumulativeDays,
  }
}
