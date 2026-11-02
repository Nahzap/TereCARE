import type { SlotKind } from '@/lib/domain'

type ListedDose = {
  id: string
  name: string
  brandName: string
  dose: string
  hour: string
  kind: SlotKind
  endDate: string | null
  note: string
  startsOn?: string | null
  replacedOn?: string | null
}

export type MedicationGroup<T extends ListedDose> = {
  key: string
  name: string
  dose: string
  brandName: string
  kind: SlotKind
  endDate: string | null
  doses: T[]
}

export function groupMedications<T extends ListedDose>(slots: readonly T[]): MedicationGroup<T>[] {
  const groups: MedicationGroup<T>[] = []
  const index = new Map<string, MedicationGroup<T>>()

  for (const slot of [...slots].sort((a, b) => a.hour.localeCompare(b.hour) || a.id.localeCompare(b.id))) {
    const key = [
      slot.name.trim().toLocaleLowerCase('es'),
      slot.dose.trim().toLocaleLowerCase('es'),
      slot.brandName.trim().toLocaleLowerCase('es'),
      slot.kind,
      slot.endDate ?? '',
      slot.startsOn ?? '',
      slot.replacedOn ?? '',
    ].join('|')
    const existing = index.get(key)
    if (existing) {
      existing.doses.push(slot)
      continue
    }
    const created = {
      key,
      name: slot.name,
      dose: slot.dose,
      brandName: slot.brandName,
      kind: slot.kind,
      endDate: slot.endDate,
      doses: [slot],
    }
    index.set(key, created)
    groups.push(created)
  }

  return groups.sort((a, b) => a.doses[0].hour.localeCompare(b.doses[0].hour) || a.name.localeCompare(b.name, 'es'))
}

export function durationText(kind: SlotKind, endDate: string | null, formatDate: (iso: string) => string) {
  if (kind === 'fixed') return 'Permanente'
  if (kind === 'until') return endDate ? `Hasta ${formatDate(endDate)}` : 'Hasta una fecha'
  return 'Solo si hay dolor'
}

export function administrationText(doses: readonly { hour: string; note: string }[]) {
  const sorted = [...doses].sort((a, b) => a.hour.localeCompare(b.hour))
  if (sorted.length === 0) return ''
  if (sorted.length === 1) return sorted[0].note
  const sameNote = sorted.every((dose) => dose.note === sorted[0].note)
  if (sameNote) return `${sorted.map((dose) => dose.hour).join(', ')} — ${sorted[0].note}`
  return sorted.map((dose) => `${dose.hour} — ${dose.note}`).join('\n')
}
