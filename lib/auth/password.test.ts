import { describe, expect, it } from 'vitest'
import { passwordError } from './password'

describe('password rules', () => {
  it('rejects short or letter-only secrets', () => {
    expect(passwordError('abc')).toMatch(/8/)
    expect(passwordError('abcdefgh')).toMatch(/número/)
    expect(passwordError('12345678')).toMatch(/letras/)
  })

  it('accepts a mixed password', () => {
    expect(passwordError('clavesegura1')).toBeNull()
  })
})
