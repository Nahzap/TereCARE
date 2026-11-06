import { describe, expect, it } from 'vitest'
import {
  applyLunchChanges,
  currentLunchRate,
  DEFAULT_LUNCH_HOURS,
  DEFAULT_LUNCH_RATE_CLP,
  lunchBrushChanges,
  lunchDiff,
  lunchStats,
} from './lunch'

describe('care lunch valuation', () => {
  it('keeps the latest lunch rate without rewriting older days', () => {
    expect(
      currentLunchRate(
        [
          { id: '1', dayRateClp: 9000, hoursPerDay: 1.5, effectiveFrom: '2026-01-01' },
          { id: '2', dayRateClp: 10000, hoursPerDay: 2, effectiveFrom: '2026-11-03' },
        ],
        '2026-11-02',
      ),
    ).toEqual({ dayRateClp: 9000, hoursPerDay: 1.5 })
    expect(
      currentLunchRate(
        [
          { id: '1', dayRateClp: 9000, hoursPerDay: 1.5, effectiveFrom: '2026-01-01' },
          { id: '2', dayRateClp: 10000, hoursPerDay: 2, effectiveFrom: '2026-11-03' },
        ],
        '2026-11-03',
      ),
    ).toEqual({ dayRateClp: 10000, hoursPerDay: 2 })
  })

  it('defaults to 9000 CLP and 1.5 hours', () => {
    expect(currentLunchRate([], '2026-11-05')).toEqual({
      dayRateClp: DEFAULT_LUNCH_RATE_CLP,
      hoursPerDay: DEFAULT_LUNCH_HOURS,
    })
  })

  it('caps lunch paint at two people per day', () => {
    const current = [
      { personId: 'ana', caregiverName: 'Ana', lunchOn: '2026-11-05' },
      { personId: 'bea', caregiverName: 'Bea', lunchOn: '2026-11-05' },
    ]
    const painted = lunchBrushChanges(current, ['2026-11-05'], {
      personId: 'pilar',
      mode: 'paint',
    })
    expect(painted.changes).toEqual([])
    expect(painted.skippedFull).toBe(true)

    const erased = lunchBrushChanges(current, ['2026-11-05'], {
      personId: 'ana',
      mode: 'erase',
    })
    expect(erased.changes).toEqual([{ personId: 'ana', assigned: false, days: ['2026-11-05'] }])
  })

  it('diffs and applies lunch assignments', () => {
    const saved = [{ personId: 'ana', caregiverName: 'Ana', lunchOn: '2026-11-01' }]
    const draft = [
      { personId: 'ana', caregiverName: 'Ana', lunchOn: '2026-11-01' },
      { personId: 'bea', caregiverName: 'Bea', lunchOn: '2026-11-02' },
    ]
    expect(lunchDiff(saved, draft)).toEqual([{ personId: 'bea', assigned: true, days: ['2026-11-02'] }])
    expect(
      applyLunchChanges(saved, [{ personId: 'bea', assigned: true, days: ['2026-11-02'] }], new Map([['bea', 'Bea']])),
    ).toEqual([
      { personId: 'ana', caregiverName: 'Ana', lunchOn: '2026-11-01' },
      { personId: 'bea', caregiverName: 'Bea', lunchOn: '2026-11-02' },
    ])
  })

  it('builds cumulative lunch amounts by caregiver', () => {
    const stats = lunchStats({
      from: '2026-11-01',
      to: '2026-11-02',
      today: '2026-11-02',
      rates: [{ id: '1', dayRateClp: 9000, hoursPerDay: 1.5, effectiveFrom: '2026-01-01' }],
      lunches: [
        { personId: 'ana', caregiverName: 'Ana', lunchOn: '2026-11-01', rateClp: 9000, hours: 1.5 },
        { personId: 'ana', caregiverName: 'Ana', lunchOn: '2026-11-02', rateClp: 9000, hours: 1.5 },
        { personId: 'pilar', caregiverName: 'Pilar', lunchOn: '2026-11-02', rateClp: 9000, hours: 1.5 },
      ],
    })
    expect(stats.amount).toBe(27000)
    expect(stats.days).toBe(3)
    expect(stats.hours).toBe(4.5)
    expect(stats.lines.map((line) => ({ label: line.label, amount: line.amount, days: line.days }))).toEqual([
      { label: 'Ana', amount: 18000, days: 2 },
      { label: 'Pilar', amount: 9000, days: 1 },
    ])
    expect(stats.cumulativeDays.at(-1)?.total).toBe(27000)
  })
})
