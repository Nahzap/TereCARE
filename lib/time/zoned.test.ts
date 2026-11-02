import { describe, expect, it } from 'vitest'
import { localDateTimeToUtc, utcToLocalDateTime } from './zoned'

describe('zoned clock', () => {
  it('round-trips a civil time in Santiago', () => {
    const local = '2026-10-28T15:30'
    const utc = localDateTimeToUtc(local)
    expect(utcToLocalDateTime(utc).value).toBe(local)
  })

  it('keeps the calendar date when the clock is near midnight', () => {
    const local = '2026-01-15T00:10'
    expect(utcToLocalDateTime(localDateTimeToUtc(local)).date).toBe('2026-01-15')
  })

  it('rejects a date without a time', () => {
    expect(() => localDateTimeToUtc('2026-10-28')).toThrow(/AAAA-MM-DDTHH:mm/)
  })
})
