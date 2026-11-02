import { describe, expect, it } from 'vitest'
import { defaultRange, parseRange } from './range'

describe('timeline range', () => {
  it('defaults to the last seven days including today', () => {
    expect(defaultRange('2026-10-28')).toEqual({ from: '2026-10-22', to: '2026-10-28' })
  })

  it('rejects an inverted range', () => {
    expect(parseRange('2026-10-28', '2026-10-01', '2026-10-28')).toEqual({
      error: 'La fecha inicial no puede ser posterior a la final',
    })
  })
})
