import { describe, expect, it } from 'vitest'
import { strengthError } from './strength'

describe('dose strength', () => {
  it('accepts a quantity with a unit', () => {
    expect(strengthError('500 mg')).toBeNull()
    expect(strengthError('1 gr')).toBeNull()
    expect(strengthError('40/10/25 mg')).toBeNull()
  })

  it('asks for the unit when the quantity is bare', () => {
    expect(strengthError('40/10/25')).toMatch(/unidad/)
    expect(strengthError('')).toMatch(/gramaje/)
  })
})
