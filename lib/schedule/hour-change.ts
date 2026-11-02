import { addDays } from '@/lib/schedule/dates'

export function earliestHourDate(today: string, takenToday: boolean) {
  return takenToday ? addDays(today, 1) : today
}

export type HourChangePlan =
  | { action: 'keep' }
  | { action: 'update' }
  | { action: 'split' }
  | { action: 'reject'; message: string }

export function planHourChange(input: {
  previousHour: string
  nextHour: string
  today: string
  takenToday: boolean
  effectiveOn: string
  startsOn: string | null
  endDate: string | null
  replacedOn: string | null
  createdOn: string
}): HourChangePlan {
  if (input.nextHour === input.previousHour) return { action: 'keep' }

  const earliest = earliestHourDate(input.today, input.takenToday)
  if (input.replacedOn && earliest >= input.replacedOn) {
    return {
      action: 'reject',
      message: 'No quedan DAR pendientes en esta hora. Los tomados se quedan como están.',
    }
  }
  if (input.effectiveOn < earliest) {
    return {
      action: 'reject',
      message: input.takenToday
        ? 'La ingesta de hoy ya está tomada. La hora nueva puede partir desde mañana.'
        : 'La hora nueva parte en la ingesta de hoy, no en días anteriores.',
    }
  }
  if (input.replacedOn && input.effectiveOn >= input.replacedOn) {
    return {
      action: 'reject',
      message: 'No quedan DAR pendientes en esta hora. Los tomados se quedan como están.',
    }
  }
  if (input.endDate && input.endDate < input.effectiveOn) {
    return {
      action: 'reject',
      message: 'Este medicamento ya no tiene ingestas desde esa fecha.',
    }
  }

  const historyFrom = input.startsOn ?? input.createdOn
  if (historyFrom >= input.effectiveOn) return { action: 'update' }
  return { action: 'split' }
}
