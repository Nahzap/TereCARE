import type { SlotKind } from '../domain'
import { dailyDoses } from './stats'

export type TimelineKind = 'dose' | 'pressure' | 'appointment' | 'expense'

export type TimelineEvent = {
  id: string
  at: string
  localDate: string
  kind: TimelineKind
  title: string
  detail: string
  time?: string
  medication?: string
  amount?: string
  systolic?: number
  diastolic?: number
  pulse?: number | null
  place?: string
  statusLabel?: string
  companion?: string
  money?: number
  payment?: 'pagado' | 'pendiente' | 'pagandose' | 'cubierto'
  buyerName?: string
}
export type DayGroup = {
  day: string
  events: TimelineEvent[]
}

function sortEventsDesc(events: readonly TimelineEvent[]) {
  return [...events].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
}

export function groupEventsByDay(events: readonly TimelineEvent[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const event of sortEventsDesc(events)) {
    const last = groups[groups.length - 1]
    if (!last || last.day !== event.localDate) groups.push({ day: event.localDate, events: [event] })
    else last.events.push(event)
  }
  return groups
}

export function filterEvents(events: readonly TimelineEvent[], kind: TimelineKind | 'all') {
  if (kind === 'all') return [...events]
  return events.filter((event) => event.kind === kind)
}

type AdherenceSlot = {
  id: string
  kind: SlotKind
  endDate: string | null
  startsOn?: string | null
  replacedOn?: string | null
  replacesSlotId?: string | null
}
type AdherenceMark = { slotId: string; takenOn: string }

export function fixedAdherence(
  slots: readonly AdherenceSlot[],
  marks: readonly AdherenceMark[],
  from: string,
  to: string,
) {
  return dailyDoses(slots, marks, from, to).reduce(
    (sum, day) => ({ done: sum.done + day.done, total: sum.total + day.total }),
    { done: 0, total: 0 },
  )
}
