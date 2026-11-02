import { describe, expect, it } from 'vitest'
import { administrationText, durationText, groupMedications } from './medication-list'

const base = {
  brandName: '',
  dose: '1 gr',
  kind: 'sos' as const,
  endDate: null,
  name: 'Paracetamol',
}

describe('medication list', () => {
  it('keeps one row when the same medicine is given at several hours', () => {
    const groups = groupMedications([
      { ...base, id: 'c', hour: '22:00', note: 'Toma 3' },
      { ...base, id: 'a', hour: '06:00', note: 'Toma 1' },
      { ...base, id: 'b', hour: '14:00', note: 'Toma 2' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].doses.map((dose) => dose.hour)).toEqual(['06:00', '14:00', '22:00'])
    expect(administrationText(groups[0].doses)).toBe('06:00 — Toma 1\n14:00 — Toma 2\n22:00 — Toma 3')
  })

  it('does not merge a different strength, brand or duration', () => {
    const groups = groupMedications([
      { ...base, id: 'a', hour: '08:00', note: 'Vía oral' },
      { ...base, id: 'b', hour: '08:00', dose: '500 mg', note: 'Vía oral' },
      { ...base, id: 'c', hour: '08:00', brandName: 'Kitadol', note: 'Vía oral' },
      { ...base, id: 'd', hour: '08:00', kind: 'fixed', note: 'Vía oral' },
      { ...base, id: 'e', hour: '08:00', kind: 'until', endDate: '2026-11-09', note: 'Vía oral' },
    ])
    expect(groups).toHaveLength(5)
  })

  it('keeps a previous hour apart from the hour that replaces it', () => {
    const groups = groupMedications([
      { ...base, id: 'old', hour: '22:00', kind: 'fixed', note: 'Noche', replacedOn: '2026-10-29' },
      { ...base, id: 'next', hour: '21:00', kind: 'fixed', note: 'Noche', startsOn: '2026-10-29' },
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.doses[0]?.hour)).toEqual(['21:00', '22:00'])
  })

  it('names a permanent course and a course that ends', () => {
    expect(durationText('fixed', null, (iso) => iso)).toBe('Permanente')
    expect(durationText('until', '2026-11-09', (iso) => iso)).toBe('Hasta 2026-11-09')
    expect(durationText('until', null, (iso) => iso)).toBe('Hasta una fecha')
    expect(durationText('sos', null, (iso) => iso)).toBe('Solo si hay dolor')
  })

  it('keeps a single instruction when every hour uses the same posology', () => {
    expect(administrationText([{ hour: '08:00', note: 'Vía oral' }])).toBe('Vía oral')
    expect(
      administrationText([
        { hour: '08:00', note: 'Vía oral' },
        { hour: '20:00', note: 'Vía oral' },
      ]),
    ).toBe('08:00, 20:00 — Vía oral')
  })
})
