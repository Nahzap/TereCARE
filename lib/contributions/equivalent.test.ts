import { describe, expect, it } from 'vitest'
import { contributionStats, currentHourRate, DEFAULT_HOUR_RATE_CLP, type ValuedCoverageHour } from './equivalent'
import type { Expense } from '@/lib/expenses/expense'

function expense(partial: Partial<Expense> & Pick<Expense, 'id' | 'spentOn' | 'payment' | 'amount' | 'personId'>): Expense {
  return {
    detail: 'medicamentos',
    note: '',
    buyerName: partial.personId === 'ana' ? 'Ana' : 'Pilar',
    installments: null,
    endsOn: null,
    ...partial,
  }
}

function hour(partial: Partial<ValuedCoverageHour> & Pick<ValuedCoverageHour, 'personId' | 'coveredOn'>): ValuedCoverageHour {
  return {
    caregiverName: partial.personId === 'ana' ? 'Ana' : 'Pilar',
    rateClp: DEFAULT_HOUR_RATE_CLP,
    ...partial,
  }
}

describe('care contribution equivalent', () => {
  it('keeps the latest rate in force for a day without rewriting older rates', () => {
    expect(
      currentHourRate(
        [
          { id: '1', rateClp: 3500, effectiveFrom: '2026-01-01' },
          { id: '2', rateClp: 4000, effectiveFrom: '2026-11-03' },
        ],
        '2026-11-02',
      ),
    ).toBe(3500)
    expect(
      currentHourRate(
        [
          { id: '1', rateClp: 3500, effectiveFrom: '2026-01-01' },
          { id: '2', rateClp: 4000, effectiveFrom: '2026-11-03' },
        ],
        '2026-11-03',
      ),
    ).toBe(4000)
  })

  it('adds stamped care hours to money as the equivalent contribution', () => {
    const stats = contributionStats({
      from: '2026-11-01',
      to: '2026-11-03',
      today: '2026-11-03',
      rates: [{ id: '1', rateClp: 3500, effectiveFrom: '2026-01-01' }],
      expenses: [
        expense({ id: 'cash', spentOn: '2026-11-01', payment: 'pagado', amount: 10000, personId: 'pilar' }),
      ],
      hours: [
        hour({ personId: 'ana', coveredOn: '2026-11-01', rateClp: 3500 }),
        hour({ personId: 'ana', coveredOn: '2026-11-01', rateClp: 3500 }),
        hour({ personId: 'ana', coveredOn: '2026-11-02', rateClp: 4000 }),
        hour({ personId: 'pilar', coveredOn: '2026-11-02', rateClp: 3500 }),
      ],
    })

    expect(stats.moneyAmount).toBe(10000)
    expect(stats.timeAmount).toBe(3500 + 3500 + 4000 + 3500)
    expect(stats.hours).toBe(4)
    expect(stats.equivalentAmount).toBe(10000 + 14500)
    expect(stats.lines.map((line) => ({ label: line.label, money: line.money, timeValue: line.timeValue, total: line.total }))).toEqual([
      { label: 'Pilar', money: 10000, timeValue: 3500, total: 13500 },
      { label: 'Ana', money: 0, timeValue: 11000, total: 11000 },
    ])

    const last = stats.cumulativeDays.at(-1)
    expect(last?.total).toBe(24500)
    expect(last?.amounts.ana).toBe(11000)
    expect(last?.amounts.pilar).toBe(13500)
  })
})
