import { describe, expect, it } from 'vitest'
import { nextOrderForDay, nextReadingOrder, pressureError } from './reading'

describe('pressure reading', () => {
  it('accepts a typical pair', () => {
    expect(pressureError(120, 80, 72)).toBeNull()
  })

  it('rejects a diastolic that is not lower', () => {
    expect(pressureError(80, 120)).toMatch(/mayor/)
    expect(pressureError(90, 90)).toMatch(/mayor/)
  })

  it('rejects values outside the capture range', () => {
    expect(pressureError(40, 30)).toMatch(/sistólica/)
    expect(pressureError(120, 20)).toMatch(/diastólica/)
  })

  it('starts each day at 1 and continues with the next integer', () => {
    expect(nextReadingOrder([])).toBe(1)
    expect(nextReadingOrder([1])).toBe(2)
    expect(nextReadingOrder([1, 2, 3])).toBe(4)
  })

  it('ignores other days when choosing the next reading number', () => {
    expect(
      nextOrderForDay(
        [
          { localDate: '2026-10-27', readingOrder: 4 },
          { localDate: '2026-10-28', readingOrder: 1 },
        ],
        '2026-10-28',
      ),
    ).toBe(2)
    expect(nextOrderForDay([{ localDate: '2026-10-27', readingOrder: 4 }], '2026-10-28')).toBe(1)
  })

  it('rejects a pulse outside range and allows omitting it', () => {
    expect(pressureError(120, 80, 10)).toMatch(/pulso/)
    expect(pressureError(120, 80, null)).toBeNull()
  })
})
