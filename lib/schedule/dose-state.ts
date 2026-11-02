import { isSlotExpiredOn } from '@/lib/schedule/dates'

export type DoseState = 'hidden' | 'ended' | 'taken' | 'pending'

type DoseSlot = {
  id: string
  startsOn?: string | null
  endDate: string | null
  replacedOn?: string | null
  replacesSlotId?: string | null
}

export function takenSet(marks: readonly { slotId: string; takenOn: string }[]) {
  return new Set(marks.map((mark) => `${mark.takenOn}|${mark.slotId}`))
}

export function replacesLookup(slots: readonly { id: string; replacesSlotId?: string | null }[]) {
  const links = new Map(slots.map((slot) => [slot.id, slot.replacesSlotId ?? null]))
  return (id: string) => links.get(id) ?? null
}

function ancestorTaken(
  replacesSlotId: string | null | undefined,
  day: string,
  taken: ReadonlySet<string>,
  replacesOf: (id: string) => string | null,
) {
  let current = replacesSlotId ?? null
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    if (taken.has(`${day}|${current}`)) return true
    current = replacesOf(current)
  }
  return false
}

export function doseState(
  slot: DoseSlot,
  day: string,
  taken: ReadonlySet<string>,
  replacesOf: (id: string) => string | null,
): DoseState {
  if (slot.startsOn && day < slot.startsOn) return 'hidden'
  if (ancestorTaken(slot.replacesSlotId, day, taken, replacesOf)) return 'hidden'
  const takenHere = taken.has(`${day}|${slot.id}`)
  if (slot.replacedOn && day >= slot.replacedOn && !takenHere) return 'hidden'
  if (isSlotExpiredOn(slot.endDate, day)) return 'ended'
  if (takenHere) return 'taken'
  return 'pending'
}

type ChainSlot = {
  id: string
  hour: string
  startsOn?: string | null
  replacedOn?: string | null
  replacesSlotId?: string | null
}

export function chainRootId(slot: ChainSlot, replacesOf: (id: string) => string | null) {
  let current = slot.id
  let parent = slot.replacesSlotId ?? replacesOf(slot.id)
  const seen = new Set<string>([current])
  while (parent && !seen.has(parent)) {
    seen.add(parent)
    current = parent
    parent = replacesOf(parent)
  }
  return current
}

export function groupHourSegments<T extends ChainSlot>(slots: readonly T[], replacesOf: (id: string) => string | null) {
  const groups: T[][] = []
  const index = new Map<string, T[]>()
  for (const slot of slots) {
    const key = `${chainRootId(slot, replacesOf)}|${slot.hour}`
    const existing = index.get(key)
    if (existing) {
      existing.push(slot)
      continue
    }
    const created = [slot]
    index.set(key, created)
    groups.push(created)
  }
  return groups
}

export function segmentForDay<T extends DoseSlot & { id: string }>(
  segments: readonly T[],
  day: string,
  taken: ReadonlySet<string>,
  replacesOf: (id: string) => string | null,
) {
  const rank: Record<DoseState, number> = { taken: 0, pending: 1, ended: 2, hidden: 3 }
  let chosen: T | null = null
  let chosenRank = rank.hidden
  for (const segment of segments) {
    const state = doseState(segment, day, taken, replacesOf)
    if (rank[state] < chosenRank) {
      chosen = segment
      chosenRank = rank[state]
    }
  }
  return chosen
}

export function currentSegment<T extends ChainSlot>(segments: readonly T[], today: string) {
  const open = segments.filter((segment) => segment.replacedOn == null || segment.replacedOn > today)
  const pool = open.length > 0 ? open : segments
  return [...pool].sort(
    (a, b) => (a.startsOn ?? '').localeCompare(b.startsOn ?? '') || a.id.localeCompare(b.id),
  )[pool.length - 1]
}
