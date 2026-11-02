export const SYSTOLIC_MIN = 60
export const SYSTOLIC_MAX = 260
export const DIASTOLIC_MIN = 40
export const DIASTOLIC_MAX = 160
export const PULSE_MIN = 30
export const PULSE_MAX = 220

export function nextReadingOrder(existingOrders: readonly number[]) {
  const highest = existingOrders.reduce((max, order) => (order > max ? order : max), 0)
  return highest + 1
}

export function nextOrderForDay(
  readings: readonly { localDate: string; readingOrder: number | null }[],
  today: string,
) {
  return nextReadingOrder(
    readings.flatMap((reading) =>
      reading.localDate === today && reading.readingOrder != null ? [reading.readingOrder] : [],
    ),
  )
}

export function pressureError(systolic: number, diastolic: number, pulse: number | null = null) {
  if (!Number.isInteger(systolic) || systolic < SYSTOLIC_MIN || systolic > SYSTOLIC_MAX) {
    return `La sistólica debe estar entre ${SYSTOLIC_MIN} y ${SYSTOLIC_MAX}`
  }
  if (!Number.isInteger(diastolic) || diastolic < DIASTOLIC_MIN || diastolic > DIASTOLIC_MAX) {
    return `La diastólica debe estar entre ${DIASTOLIC_MIN} y ${DIASTOLIC_MAX}`
  }
  if (systolic <= diastolic) return 'La sistólica tiene que ser mayor que la diastólica'
  if (pulse != null && (!Number.isInteger(pulse) || pulse < PULSE_MIN || pulse > PULSE_MAX)) {
    return `El pulso debe estar entre ${PULSE_MIN} y ${PULSE_MAX}`
  }
  return null
}
