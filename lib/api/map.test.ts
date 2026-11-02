import { describe, expect, it } from 'vitest'
import { personName } from './map'

describe('personName', () => {
  it('prefers the full name', () => {
    expect(personName({ full_name: ' Ana ', email: 'ana@example.com' })).toBe('Ana')
  })

  it('falls back to email and then to null', () => {
    expect(personName({ full_name: ' ', email: 'ana@example.com' })).toBe('ana@example.com')
    expect(personName(null)).toBeNull()
  })
})