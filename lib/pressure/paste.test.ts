import { describe, expect, it } from 'vitest'
import {
  matchCarePersonId,
  parsePressureLine,
  parsePressurePaste,
  pressureMeasuredAtBlock,
  resolvePasteDateTime,
} from './paste'
import { caregiverFromNote, caregiverNote, pressureBodySchema } from './schema'

describe('pressure paste', () => {
  const today = '2026-11-09'

  it('parses a line with DD/MM and HH.mm', () => {
    const row = parsePressureLine('113 64 67 09/11 15.12 rodrigo', 1, today)
    expect(row).toEqual({
      ok: true,
      line: 1,
      value: {
        systolic: 113,
        diastolic: 64,
        pulse: 67,
        measuredAt: '2026-11-09T15:12',
        caregiverName: 'rodrigo',
      },
    })
  })

  it('uses previous year when the calendar day would be in the future', () => {
    expect(resolvePasteDateTime(31, 12, 20, 0, '2026-11-09')).toBe('2025-12-31T20:00')
  })

  it('keeps October dates in the current year when today is November', () => {
    expect(resolvePasteDateTime(28, 10, 21, 43, today)).toBe('2026-10-28T21:43')
  })

  it('parses several lines and skips blanks', () => {
    const rows = parsePressurePaste(
      `113 64 67 09/11 15.12 rodrigo

114 56 68 08/11 21.44 javiera
mala
`,
      today,
    )
    expect(rows).toHaveLength(3)
    expect(rows[0]?.ok).toBe(true)
    expect(rows[1]?.ok).toBe(true)
    expect(rows[2]?.ok).toBe(false)
  })

  it('matches caregiver names ignoring case', () => {
    const people = [
      { id: '1', name: 'Rodrigo' },
      { id: '2', name: 'Javiera' },
    ]
    expect(matchCarePersonId('rodrigo', people)).toBe('1')
    expect(matchCarePersonId('Javi', people)).toBe('2')
    expect(matchCarePersonId('nadie', people)).toBeNull()
  })

  it('blocks dates outside the history window', () => {
    expect(pressureMeasuredAtBlock('2026-11-09T15:12', today)).toBeNull()
    expect(pressureMeasuredAtBlock('2019-01-01T10:00', today)).toBe('past')
    expect(pressureMeasuredAtBlock('2026-12-20T10:00', today)).toBe('future')
  })
})

describe('pressure schema and caregiver note', () => {
  it('accepts measuredAt and personId', () => {
    const parsed = pressureBodySchema.safeParse({
      systolic: 120,
      diastolic: 80,
      pulse: 70,
      measuredAt: '2026-11-09T15:12',
      personId: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(parsed.success).toBe(true)
  })

  it('round-trips caregiver notes', () => {
    expect(caregiverFromNote(caregiverNote('Rodrigo'))).toBe('Rodrigo')
    expect(caregiverFromNote('otro texto')).toBeNull()
  })
})
