import { describe, expect, it } from 'vitest'
import { addDays, isSlotExpiredOn, mondayOf, periodOf, sortSlots, weekDays } from './dates'

describe('schedule dates', () => {
  it('maps Sunday 2026-10-25 to the previous Monday', () => {
    expect(mondayOf('2026-10-25')).toBe('2026-10-19')
  })

  it('keeps Monday 2026-10-26', () => {
    expect(mondayOf('2026-10-26')).toBe('2026-10-26')
  })

  it('adds days across the month boundary', () => {
    expect(addDays('2026-10-26', 6)).toBe('2026-11-01')
  })

  it('treats the end date as still active', () => {
    expect(isSlotExpiredOn('2026-11-09', '2026-11-09')).toBe(false)
    expect(isSlotExpiredOn('2026-11-09', '2026-11-10')).toBe(true)
    expect(isSlotExpiredOn(null, '2026-11-10')).toBe(false)
  })

  it('splits the day into morning, afternoon, and night', () => {
    expect(periodOf('06:00').id).toBe('morning')
    expect(periodOf('12:00').id).toBe('afternoon')
    expect(periodOf('20:00').id).toBe('night')
  })

  it('orders a fixed slot before an sos slot at the same hour', () => {
    const sorted = sortSlots([
      { hour: '22:00', kind: 'sos' as const },
      { hour: '22:00', kind: 'fixed' as const },
    ])
    expect(sorted.map((slot) => slot.kind)).toEqual(['fixed', 'sos'])
  })

  it('returns seven week days ending on Sunday', () => {
    const days = weekDays('2026-10-26')
    expect(days).toHaveLength(7)
    const [year, month, day] = days[6].split('-').map(Number)
    expect(new Date(Date.UTC(year, month - 1, day)).getUTCDay()).toBe(0)
  })
})
