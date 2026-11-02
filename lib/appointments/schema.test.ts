import { describe, expect, it } from 'vitest'
import { appointmentBodySchema } from './schema'

const valid = {
  professionalName: 'Dra. Ana Soto',
  place: 'Consultorio 4',
  startsAt: '2026-10-30T10:30',
  reason: 'Control',
  companion: 'Rodrigo',
  status: 'programada' as const,
}

describe('appointment body', () => {
  it('accepts professional, place, companion and status as separate fields', () => {
    const parsed = appointmentBodySchema.parse(valid)
    expect(parsed.professionalName).toBe('Dra. Ana Soto')
    expect(parsed.place).toBe('Consultorio 4')
    expect(parsed.companion).toBe('Rodrigo')
    expect(parsed.status).toBe('programada')
  })

  it('trims the companion and allows the row without one', () => {
    expect(appointmentBodySchema.parse({ ...valid, companion: '  ' }).companion).toBe('')
    expect(appointmentBodySchema.parse({ ...valid, companion: undefined }).companion).toBeUndefined()
  })

  it('rejects a visit that has no professional or no place', () => {
    expect(appointmentBodySchema.safeParse({ ...valid, professionalName: ' ' }).success).toBe(false)
    expect(appointmentBodySchema.safeParse({ ...valid, place: '' }).success).toBe(false)
  })

  it('rejects a status outside the four known values', () => {
    expect(appointmentBodySchema.safeParse({ ...valid, status: 'pendiente' }).success).toBe(false)
  })
})
