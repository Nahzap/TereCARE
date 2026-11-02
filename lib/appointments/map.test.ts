import { describe, expect, it } from 'vitest'
import { APPOINTMENT_COLUMNS, appointmentWrite, mapAppointment, type AppointmentRow } from './map'

const row: AppointmentRow = {
  id: 'a458ce71-9885-437a-8906-3f34ad581dbd',
  patient_id: 'f177abda-09a6-4902-bdce-c0c6edfb1be4',
  professional_name: 'Dra. Ana Soto',
  place: 'Consultorio 4',
  starts_at: '2026-10-30T13:30:00.000Z',
  reason: 'Control',
  companion: 'Rodrigo',
  bring: 'Exámenes',
  note: '',
  status: 'programada',
  profiles: { full_name: 'Rodrigo Jofré', email: 'rodrigo@example.com' },
}

describe('appointment mapping', () => {
  it('keeps professional, place and companion as separate fields', () => {
    const appointment = mapAppointment(row)
    expect(appointment.professionalName).toBe('Dra. Ana Soto')
    expect(appointment.place).toBe('Consultorio 4')
    expect(appointment.companion).toBe('Rodrigo')
    expect(appointment.bring).toBe('Exámenes')
    expect(appointment.recordedByName).toBe('Rodrigo Jofré')
    expect(appointment.status).toBe('programada')
  })

  it('treats a missing companion as an empty name', () => {
    expect(mapAppointment({ ...row, companion: null, bring: null, reason: null, note: null }).companion).toBe('')
  })

  it('selects the companion column the form writes', () => {
    expect(APPOINTMENT_COLUMNS.split(',').map((column) => column.trim())).toEqual(
      expect.arrayContaining(['companion', 'professional_name', 'place', 'reason', 'status']),
    )
    expect(
      appointmentWrite(
        {
          professionalName: 'Dra. Ana Soto',
          place: 'Consultorio 4',
          startsAt: '2026-10-30T10:30',
          reason: 'Control',
          companion: '  Rodrigo  ',
          status: 'programada',
        },
        '2026-10-30T13:30:00.000Z',
        'user-1',
      ),
    ).toMatchObject({
      professional_name: 'Dra. Ana Soto',
      place: 'Consultorio 4',
      companion: 'Rodrigo',
      status: 'programada',
      recorded_by: 'user-1',
    })
  })

  it('rejects an unknown status instead of showing a broken row', () => {
    expect(() => mapAppointment({ ...row, status: 'pendiente' })).toThrow(/Estado de cita desconocido/)
  })
})
