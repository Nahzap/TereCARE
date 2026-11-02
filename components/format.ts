import type { Role, Slot, SlotKind } from '@/lib/domain'
import { addDays, shortDate } from '@/lib/schedule/dates'

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Dueño',
  caregiver: 'Cuidador',
  viewer: 'Solo lectura',
}

export function formatDMY(isoDate: string) {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${day}/${month}/${year.slice(-2)}`
}

export function weekRangeLabel(monday: string) {
  const sunday = addDays(monday, 6)
  return `${shortDate(monday)} – ${shortDate(sunday)} ${sunday.slice(0, 4)}`
}

export function clockHours(from: number, to: number) {
  const hours: string[] = []
  for (let hour = from; hour <= to; hour += 1) {
    hours.push(`${String(hour).padStart(2, '0')}:00`)
  }
  return hours
}

export function hourChoices(current?: string) {
  const hours = clockHours(0, 23)
  if (current && !hours.includes(current)) hours.push(current)
  return hours.sort()
}

export function namesForKind(slots: readonly Slot[], kind: SlotKind) {
  const names: string[] = []
  for (const slot of slots) {
    if (slot.kind !== kind) continue
    if (!names.includes(slot.name)) names.push(slot.name)
  }
  return names
}

export function latestUntilDate(slots: readonly Slot[]) {
  let latest: string | null = null
  for (const slot of slots) {
    if (slot.kind !== 'until' || !slot.endDate) continue
    if (!latest || slot.endDate > latest) latest = slot.endDate
  }
  return latest
}
