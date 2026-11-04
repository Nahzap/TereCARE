import { describe, expect, it } from 'vitest'
import { appointmentDayLabel, groupAppointments, sortAppointmentsByStart, type AppointmentMoment } from './ordering'

function item(partial: Partial<AppointmentMoment> & Pick<AppointmentMoment, 'id' | 'startsAt' | 'localDate'>): AppointmentMoment {
  return { status: 'programada', ...partial }
}

describe('appointment order', () => {
  const today = '2026-10-28'

  it('sorts every visit by date and time from nearest to furthest', () => {
    const ordered = sortAppointmentsByStart([
      item({ id: 'b', startsAt: '2026-11-02T15:00:00.000Z', localDate: '2026-11-02' }),
      item({ id: 'a', startsAt: '2026-10-28T18:00:00.000Z', localDate: '2026-10-28' }),
      item({ id: 'c', startsAt: '2026-10-28T14:00:00.000Z', localDate: '2026-10-28' }),
    ])
    expect(ordered.map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
  })

  it('puts the nearest future visit first and keeps later ones after it', () => {
    const groups = groupAppointments(
      [
        item({ id: 'b', startsAt: '2026-11-02T15:00:00.000Z', localDate: '2026-11-02' }),
        item({ id: 'a', startsAt: '2026-10-28T18:00:00.000Z', localDate: '2026-10-28' }),
      ],
      today,
    )
    expect(groups.next?.id).toBe('a')
    expect(groups.upcoming.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(appointmentDayLabel('2026-10-28', today)).toBe('hoy')
  })

  it('separates a scheduled visit that already passed', () => {
    const groups = groupAppointments(
      [item({ id: 'late', startsAt: '2026-10-20T15:00:00.000Z', localDate: '2026-10-20' })],
      today,
    )
    expect(groups.next).toBeNull()
    expect(groups.overdue.map((entry) => entry.id)).toEqual(['late'])
  })

  it('lists attended and cancelled visits in chronological order', () => {
    const groups = groupAppointments(
      [
        item({ id: 'old', startsAt: '2026-09-01T15:00:00.000Z', localDate: '2026-09-01', status: 'asistio' }),
        item({ id: 'new', startsAt: '2026-10-01T15:00:00.000Z', localDate: '2026-10-01', status: 'cancelada' }),
      ],
      today,
    )
    expect(groups.past.map((entry) => entry.id)).toEqual(['old', 'new'])
  })
})
