import { describe, expect, it } from 'vitest'
import { parseSection, sectionHref } from './section'

describe('patient section', () => {
  it('defaults to posology', () => {
    expect(parseSection(undefined)).toBe('posologia')
    expect(parseSection('otra')).toBe('posologia')
  })

  it('builds stable section links and keeps the week only on posology', () => {
    const patientId = 'f177abda-09a6-4902-bdce-c0c6edfb1be4'
    expect(sectionHref(patientId, 'posologia', '2026-10-26')).toBe(
      `/pacientes/${patientId}?seccion=posologia&semana=2026-10-26`,
    )
    expect(sectionHref(patientId, 'citas', '2026-10-26')).toBe(`/pacientes/${patientId}?seccion=citas`)
    expect(sectionHref(patientId, 'acceso')).toBe(`/acceso?ficha=${patientId}`)
  })

  it('accepts each tab and the first value of a repeated query', () => {
    expect(parseSection('citas')).toBe('citas')
    expect(parseSection('gastos')).toBe('gastos')
    expect(parseSection(['dashboard', 'presion'])).toBe('dashboard')
  })
})
