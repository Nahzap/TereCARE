import type { SlotKind } from '../domain'

export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const KIND_ORDER: Record<SlotKind, number> = {
  fixed: 0,
  until: 1,
  sos: 2,
}

export const DAY_NAMES = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO']
export const DAY_SHORT = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']

type PeriodId = 'morning' | 'afternoon' | 'night'

export type DayPeriod = {
  id: PeriodId
  title: string
  short: string
  iconName: 'SunHorizon' | 'Sun' | 'Moon'
}

function parseISODate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return { year, month, day }
}

function formatUTC(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayISO(timeZone = 'America/Santiago') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function addDays(isoDate: string, n: number) {
  const { year, month, day } = parseISODate(isoDate)
  return formatUTC(new Date(Date.UTC(year, month - 1, day + n)))
}

export function mondayOf(isoDate: string) {
  const { year, month, day } = parseISODate(isoDate)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1
  return addDays(isoDate, -daysFromMonday)
}

export function isMonday(isoDate: string) {
  const { year, month, day } = parseISODate(isoDate)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 1
}

export function weekDays(mondayIso: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(mondayIso, index))
}

export function isSlotExpiredOn(endDate: string | null, isoDate: string) {
  return endDate !== null && isoDate > endDate
}

export function shortDate(isoDate: string) {
  const { month, day } = parseISODate(isoDate)
  return `${String(day).padStart(2, '0')} ${MONTHS[month - 1]}`
}

export function periodOf(hour: string): DayPeriod {
  const value = Number(hour.slice(0, 2))
  if (value >= 5 && value <= 11) {
    return {
      id: 'morning',
      title: 'MAÑANA (06:00 a 11:59 hrs)',
      short: 'Mañana',
      iconName: 'SunHorizon',
    }
  }
  if (value >= 12 && value <= 19) {
    return {
      id: 'afternoon',
      title: 'TARDE (12:00 a 19:59 hrs)',
      short: 'Tarde',
      iconName: 'Sun',
    }
  }
  return {
    id: 'night',
    title: 'NOCHE (20:00 a 23:59 hrs)',
    short: 'Noche',
    iconName: 'Moon',
  }
}

export function sortSlots<T extends { hour: string; kind: SlotKind }>(slots: readonly T[]): T[] {
  return [...slots].sort((a, b) => {
    if (a.hour < b.hour) return -1
    if (a.hour > b.hour) return 1
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
  })
}
