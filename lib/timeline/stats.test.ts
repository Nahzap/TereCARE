import { describe, expect, it } from 'vitest'
import { appointmentCounts, coverageStats, dailyDoses, pressureSeries, rangeDays } from './stats'

describe('dashboard stats', () => {
  it('lists every day of the range in order', () => {
    expect(rangeDays('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(rangeDays('2026-11-02', '2026-11-01')).toEqual([])
  })

  it('counts fixed doses per day and sos doses apart', () => {
    const days = dailyDoses(
      [
        { id: 'fixed', kind: 'fixed', endDate: null },
        { id: 'sos', kind: 'sos', endDate: null },
        { id: 'ended', kind: 'until', endDate: '2026-10-28' },
      ],
      [
        { slotId: 'fixed', takenOn: '2026-10-28' },
        { slotId: 'sos', takenOn: '2026-10-29' },
        { slotId: 'sos', takenOn: '2026-10-29' },
      ],
      '2026-10-28',
      '2026-10-29',
    )
    expect(days).toEqual([
      { day: '2026-10-28', done: 1, total: 2, sos: 0, care: 'home' },
      { day: '2026-10-29', done: 0, total: 1, sos: 2, care: 'home' },
    ])
  })

  it('does not count days before the medication was created unless it was marked', () => {
    const days = dailyDoses(
      [{ id: 'fixed', kind: 'fixed', endDate: null, createdOn: '2026-10-28' }],
      [{ slotId: 'fixed', takenOn: '2026-10-26' }],
      '2026-10-26',
      '2026-10-28',
    )
    expect(days.map((day) => [day.done, day.total])).toEqual([[1, 1], [0, 0], [0, 1]])
  })

  it('keeps one dose per day when the hour changed', () => {
    const days = dailyDoses(
      [
        { id: 'old', kind: 'fixed', endDate: null, replacedOn: '2026-10-29' },
        { id: 'next', kind: 'fixed', endDate: null, startsOn: '2026-10-29', replacesSlotId: 'old' },
      ],
      [{ slotId: 'old', takenOn: '2026-10-29' }],
      '2026-10-28',
      '2026-10-30',
    )
    expect(days.map((day) => [day.done, day.total])).toEqual([[0, 1], [1, 1], [0, 1]])
  })

  it('sorts pressure readings from oldest to newest', () => {
    const points = pressureSeries([
      { measuredAt: '2026-10-29T12:00:00.000Z', systolic: 130, diastolic: 80, pulse: null },
      { measuredAt: '2026-10-28T12:00:00.000Z', systolic: 120, diastolic: 75, pulse: 70 },
    ])
    expect(points.map((point) => point.systolic)).toEqual([120, 130])
    expect(points[1]?.pulse).toBeNull()
  })

  it('counts appointments for every status, including empty ones', () => {
    expect(appointmentCounts([{ status: 'asistio' }, { status: 'asistio' }, { status: 'cancelada' }])).toEqual([
      { status: 'programada', count: 0 },
      { status: 'asistio', count: 2 },
      { status: 'no_asistio', count: 0 },
      { status: 'cancelada', count: 1 },
    ])
  })

  it('splits covered and shared hours per day and sums hours per caregiver', () => {
    const stats = coverageStats(
      [
        { personId: 'a', coveredOn: '2026-11-01', hour: 8, caregiverName: 'Ana' },
        { personId: 'b', coveredOn: '2026-11-01', hour: 8, caregiverName: 'Beto' },
        { personId: 'a', coveredOn: '2026-11-01', hour: 9, caregiverName: 'Ana' },
        { personId: 'a', coveredOn: '2026-11-01', hour: 9, caregiverName: 'Ana' },
        { personId: 'b', coveredOn: '2026-11-02', hour: 23, caregiverName: 'Beto' },
        { personId: 'b', coveredOn: '2026-11-05', hour: 1, caregiverName: 'Beto' },
      ],
      '2026-11-01',
      '2026-11-02',
    )
    expect(stats.totalHours).toBe(48)
    expect(stats.coveredHours).toBe(3)
    expect(stats.sharedHours).toBe(1)
    expect(stats.days).toEqual([
      { day: '2026-11-01', covered: 2, shared: 1, care: 'home' },
      { day: '2026-11-02', covered: 1, shared: 0, care: 'home' },
    ])
    expect(stats.people).toEqual([
      { personId: 'a', name: 'Ana', hours: 2 },
      { personId: 'b', name: 'Beto', hours: 2 },
    ])
  })

  it('leaves hospital days and the days before the alta out of the totals', () => {
    const situation = {
      dischargedOn: '2026-11-01',
      hospitalizations: [{ id: 'stay', admittedOn: '2026-11-02', dischargedOn: '2026-11-03' }],
    }
    const doses = dailyDoses(
      [{ id: 'fixed', kind: 'fixed' as const, endDate: null }],
      [
        { slotId: 'fixed', takenOn: '2026-10-31' },
        { slotId: 'fixed', takenOn: '2026-11-02' },
      ],
      '2026-10-31',
      '2026-11-03',
      situation,
    )
    expect(doses.map((day) => [day.care, day.done, day.total])).toEqual([
      ['outside', 0, 0],
      ['home', 0, 1],
      ['hospital', 0, 0],
      ['home', 0, 1],
    ])

    const coverage = coverageStats(
      [
        { personId: 'a', coveredOn: '2026-10-31', hour: 8, caregiverName: 'Ana' },
        { personId: 'a', coveredOn: '2026-11-01', hour: 8, caregiverName: 'Ana' },
        { personId: 'a', coveredOn: '2026-11-02', hour: 8, caregiverName: 'Ana' },
      ],
      '2026-10-31',
      '2026-11-03',
      situation,
    )
    expect(coverage.totalHours).toBe(48)
    expect(coverage.coveredHours).toBe(1)
    expect(coverage.people).toEqual([{ personId: 'a', name: 'Ana', hours: 1 }])
    expect(coverage.days.map((day) => day.care)).toEqual(['outside', 'home', 'hospital', 'home'])
  })
})
