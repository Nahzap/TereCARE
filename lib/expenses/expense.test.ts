import { describe, expect, it } from 'vitest'
import {
  expenseDateError,
  expenseGroups,
  expenseHorizon,
  expensePlanError,
  expensePortions,
  expenseStats,
  formatPesos,
  type Expense,
} from './expense'

const today = '2026-11-02'

function expense(partial: Partial<Expense> & Pick<Expense, 'id' | 'spentOn' | 'payment' | 'amount'>): Expense {
  return {
    detail: 'medicamentos',
    personId: 'ana',
    buyerName: 'Ana',
    installments: null,
    endsOn: null,
    ...partial,
  }
}

describe('expenses', () => {
  it('formats pesos with a thousands dot and no decimals', () => {
    expect(formatPesos(12490)).toBe('$12.490')
  })

  it('allows a future date up to one year and rejects anything beyond the history', () => {
    expect(expenseDateError('2027-11-02', today)).toBeNull()
    expect(expenseDateError('2027-11-03', today)).toMatch(/un año/)
    expect(expenseDateError('2021-12-31', today)).toMatch(/historial/)
  })

  it('looks as far forward as the dashboard looks backward', () => {
    expect(expenseHorizon('2026-10-27', '2026-11-02')).toEqual({ from: '2026-10-27', to: '2026-11-08' })
  })

  it('splits a plan into installments that add up to the total', () => {
    const portions = expensePortions({
      spentOn: '2026-11-02',
      endsOn: '2027-01-02',
      payment: 'pagandose',
      amount: 10000,
      installments: 3,
    })
    expect(portions.map((portion) => portion.amount)).toEqual([3333, 3333, 3334])
    expect(portions.reduce((sum, portion) => sum + portion.amount, 0)).toBe(10000)
    expect(portions[0]?.date).toBe('2026-11-02')
    expect(portions[2]?.date).toBe('2027-01-02')
    expect(expensePlanError({ payment: 'pagandose', spentOn: '2026-11-02', endsOn: '2026-10-01', installments: 3 }, today)).toMatch(/anterior/)
  })

  it('keeps debts and future installments owed, apart from money already paid', () => {
    const stats = expenseStats(
      [
        expense({ id: 'old-debt', spentOn: '2026-08-01', payment: 'pendiente', amount: 5000 }),
        expense({ id: 'paid', spentOn: '2026-11-01', payment: 'pagado', amount: 12000, detail: 'cita', personId: 'pilar', buyerName: 'Pilar' }),
        expense({
          id: 'plan',
          spentOn: '2026-11-02',
          endsOn: '2026-11-08',
          payment: 'pagandose',
          amount: 6000,
          installments: 2,
          detail: 'terapia',
        }),
      ],
      '2026-10-27',
      '2026-11-02',
      today,
    )
    expect(stats.paidAmount).toBe(12000)
    expect(stats.installingAmount).toBe(6000)
    expect(stats.stillOwed).toBe(8000)
    expect(stats.days.find((day) => day.day === '2026-11-08')).toMatchObject({ installing: 3000 })
    expect(stats.details.find((detail) => detail.key === 'cita')).toMatchObject({ paid: 12000 })
  })

  it('lists debts, then plans, then prepaid dates, then past payments', () => {
    const groups = expenseGroups(
      [
        expense({ id: 'past', spentOn: '2026-10-01', payment: 'pagado', amount: 1000 }),
        expense({ id: 'future', spentOn: '2026-12-01', payment: 'pagado', amount: 2000 }),
        expense({ id: 'plan', spentOn: '2026-11-02', payment: 'pagandose', amount: 9000, installments: 3, endsOn: '2027-01-02' }),
        expense({ id: 'debt', spentOn: '2026-11-20', payment: 'pendiente', amount: 3000 }),
      ],
      today,
    )
    expect(groups.map((group) => group.id)).toEqual(['pending', 'installing', 'upcoming', 'paid'])
  })

  it('leaves a covered expense out of the totals', () => {
    const stats = expenseStats(
      [
        expense({ id: 'back', spentOn: '2026-11-01', payment: 'cubierto', amount: 40000, detail: 'medicamentos' }),
        expense({ id: 'paid', spentOn: '2026-11-01', payment: 'pagado', amount: 1000 }),
      ],
      '2026-10-27',
      '2026-11-02',
      today,
    )
    expect(stats.paidAmount).toBe(1000)
    expect(stats.stillOwed).toBe(0)
    expect(stats.days.find((day) => day.day === '2026-11-01')).toMatchObject({ paid: 1000, pending: 0, installing: 0 })
  })
})
