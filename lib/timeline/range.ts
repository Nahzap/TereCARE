import { addDays } from '../schedule/dates'
import { isoDateSchema } from '../validation'

export function defaultRange(today: string) {
  return { from: addDays(today, -6), to: today }
}

export function parseRange(from: string | null, to: string | null, today: string) {
  if (from == null && to == null) return defaultRange(today)
  if (!from || !to || !isoDateSchema.safeParse(from).success || !isoDateSchema.safeParse(to).success) {
    return { error: 'Indica un rango con from y to en formato AAAA-MM-DD' as const }
  }
  if (from > to) return { error: 'La fecha inicial no puede ser posterior a la final' as const }
  if (addDays(from, 366) < to) return { error: 'El rango no puede superar un año' as const }
  return { from, to }
}
