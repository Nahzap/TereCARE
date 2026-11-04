import { z } from 'zod'
import { daysBetween } from '@/lib/coverage/schedule'
import { addDays } from '@/lib/schedule/dates'
import { isoDateSchema } from '@/lib/validation'

export const EXPENSE_DETAILS = ['medicamentos', 'cita', 'terapia', 'cuidados', 'comida', 'cuentas', 'otros'] as const
export const EXPENSE_PAYMENTS = ['pagado', 'pendiente', 'pagandose', 'cubierto'] as const

export type ExpenseDetail = (typeof EXPENSE_DETAILS)[number]
export type ExpensePayment = (typeof EXPENSE_PAYMENTS)[number]

export const EXPENSE_DETAIL_LABEL: Record<ExpenseDetail, string> = {
  medicamentos: 'Medicamentos',
  cita: 'Cita médica',
  terapia: 'Terapia',
  cuidados: 'Cuidados',
  comida: 'Comida',
  cuentas: 'Cuentas servicios',
  otros: 'Otros',
}

export const EXPENSE_PAYMENT_LABEL: Record<ExpensePayment, string> = {
  pagado: 'Pagado',
  pendiente: 'Pendiente de pago',
  pagandose: 'Pagándose',
  cubierto: 'Cubierto',
}

const HISTORY_YEARS_BACK = 4
const FUTURE_DAYS = 365
const PLAN_DAYS = 365 * 5
export const EXPENSE_AMOUNT_MAX = 99_999_999

export const EXPENSE_NOTE_MAX = 200

export type Expense = {
  id: string
  spentOn: string
  payment: ExpensePayment
  detail: ExpenseDetail
  note: string
  amount: number
  personId: string
  buyerName: string
  installments: number | null
  endsOn: string | null
}

export const expenseBodySchema = z
  .object({
    personId: z.uuid('Elige a quién compró'),
    spentOn: isoDateSchema,
    payment: z.enum(EXPENSE_PAYMENTS, 'Indica cómo se paga'),
    detail: z.enum(EXPENSE_DETAILS, 'Elige el tipo de gasto'),
    note: z
      .string()
      .max(EXPENSE_NOTE_MAX, `El detalle no puede pasar de ${EXPENSE_NOTE_MAX} caracteres`)
      .optional()
      .transform((value) => {
        const trimmed = (value ?? '').trim()
        return trimmed ? trimmed : null
      }),
    amount: z
      .number('Escribe el monto en pesos')
      .int('El monto no lleva decimales')
      .min(1, 'El monto tiene que ser mayor que cero')
      .max(EXPENSE_AMOUNT_MAX, 'El monto es demasiado grande'),
    installments: z.number().int().min(2, 'Las cuotas van de 2 a 36').max(36, 'Las cuotas van de 2 a 36').nullable(),
    endsOn: isoDateSchema.nullable(),
  })
  .superRefine((body, context) => {
    if (body.payment === 'pagandose') {
      if (body.installments == null) {
        context.addIssue({ code: 'custom', message: 'Indica cuántas cuotas son', path: ['installments'] })
      }
      if (!body.endsOn) {
        context.addIssue({ code: 'custom', message: 'Indica hasta qué fecha se pagan las cuotas', path: ['endsOn'] })
      }
      return
    }
    if (body.installments != null || body.endsOn != null) {
      context.addIssue({ code: 'custom', message: 'Las cuotas solo se anotan cuando el gasto se está pagando', path: ['payment'] })
    }
  })

export type ExpenseBody = z.output<typeof expenseBodySchema>

export function expenseEarliest(today: string) {
  return `${Number(today.slice(0, 4)) - HISTORY_YEARS_BACK}-01-01`
}

export function expenseLatest(today: string) {
  return addDays(today, FUTURE_DAYS)
}

export function expenseDateError(date: string, today: string) {
  if (date < expenseEarliest(today)) return 'Esa fecha queda fuera del historial.'
  if (date > expenseLatest(today)) return 'La fecha no puede pasar de un año desde hoy.'
  return null
}

export function expensePlanError(expense: Pick<ExpenseBody, 'payment' | 'spentOn' | 'endsOn' | 'installments'>, today: string) {
  const dateError = expenseDateError(expense.spentOn, today)
  if (dateError) return dateError
  if (expense.payment !== 'pagandose' || !expense.endsOn || expense.installments == null) return null
  if (expense.endsOn < expense.spentOn) return 'La última cuota no puede ser anterior a la primera.'
  if (expense.endsOn > addDays(expense.spentOn, PLAN_DAYS)) return 'El plazo de las cuotas no puede pasar de cinco años.'
  return null
}

export function formatPesos(amount: number) {
  const text = String(Math.trunc(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `$${text}`
}

/** The dashboard range looks backward. Expenses also look the same number of days forward. */
export function expenseHorizon(from: string, to: string) {
  return { from, to: addDays(to, daysBetween(from, to)) }
}

export function installmentDates(start: string, end: string, count: number) {
  if (count <= 1) return [start]
  const span = daysBetween(start, end)
  return Array.from({ length: count }, (_, index) => addDays(start, Math.round((span * index) / (count - 1))))
}

export function installmentAmounts(total: number, count: number) {
  const safeCount = Math.max(1, count)
  const base = Math.floor(total / safeCount)
  const amounts = Array.from({ length: safeCount }, () => base)
  amounts[safeCount - 1] = total - base * (safeCount - 1)
  return amounts
}

export type ExpensePortion = { date: string; bucket: 'paid' | 'pending' | 'installing' | 'covered'; amount: number }

export function expensePortions(expense: Pick<Expense, 'spentOn' | 'payment' | 'amount' | 'installments' | 'endsOn'>): ExpensePortion[] {
  if (expense.payment === 'cubierto') {
    return [{ date: expense.spentOn, bucket: 'covered', amount: expense.amount }]
  }
  if (expense.payment !== 'pagandose') {
    return [{ date: expense.spentOn, bucket: expense.payment === 'pagado' ? 'paid' : 'pending', amount: expense.amount }]
  }
  const count = expense.installments ?? 1
  const dates = installmentDates(expense.spentOn, expense.endsOn ?? expense.spentOn, count)
  return installmentAmounts(expense.amount, count).map((amount, index) => ({
    date: dates[index] ?? expense.spentOn,
    bucket: 'installing' as const,
    amount,
  }))
}

export type ExpenseGroup = { id: 'pending' | 'installing' | 'upcoming' | 'paid' | 'covered'; title: string; rows: Expense[] }

export function expenseGroups(expenses: readonly Expense[], today: string): ExpenseGroup[] {
  const byAmount = (left: Expense, right: Expense) =>
    right.amount - left.amount || EXPENSE_DETAIL_LABEL[left.detail].localeCompare(EXPENSE_DETAIL_LABEL[right.detail], 'es')
  const pending = expenses
    .filter((expense) => expense.payment === 'pendiente')
    .sort((left, right) => left.spentOn.localeCompare(right.spentOn) || byAmount(left, right))
  const installing = expenses
    .filter((expense) => expense.payment === 'pagandose')
    .sort((left, right) => left.spentOn.localeCompare(right.spentOn) || byAmount(left, right))
  const upcoming = expenses
    .filter((expense) => expense.payment === 'pagado' && expense.spentOn > today)
    .sort((left, right) => left.spentOn.localeCompare(right.spentOn) || byAmount(left, right))
  const paid = expenses
    .filter((expense) => expense.payment === 'pagado' && expense.spentOn <= today)
    .sort((left, right) => right.spentOn.localeCompare(left.spentOn) || byAmount(left, right))
  const covered = expenses
    .filter((expense) => expense.payment === 'cubierto')
    .sort((left, right) => right.spentOn.localeCompare(left.spentOn) || byAmount(left, right))
  return [
    pending.length > 0 ? { id: 'pending' as const, title: 'Pendiente de pago', rows: pending } : null,
    installing.length > 0 ? { id: 'installing' as const, title: 'Pagándose', rows: installing } : null,
    upcoming.length > 0 ? { id: 'upcoming' as const, title: 'Pagado, por venir', rows: upcoming } : null,
    paid.length > 0 ? { id: 'paid' as const, title: 'Pagado', rows: paid } : null,
    covered.length > 0 ? { id: 'covered' as const, title: 'Cubierto', rows: covered } : null,
  ].filter((group): group is ExpenseGroup => group != null)
}

export type ExpenseDay = { day: string; paid: number; pending: number; installing: number; covered: number }
export type ExpenseSlice = {
  key: string
  label: string
  paid: number
  pending: number
  installing: number
  covered: number
}
export type ExpenseBuyerLine = { key: string; label: string; color: string; total: number }
export type ExpenseCumulativeDay = { day: string; total: number; amounts: Record<string, number> }

export type ExpenseStats = {
  from: string
  to: string
  paidAmount: number
  pendingAmount: number
  installingAmount: number
  coveredAmount: number
  paidCount: number
  pendingCount: number
  installingCount: number
  coveredCount: number
  stillOwed: number
  contributedAmount: number
  days: ExpenseDay[]
  cumulativeDays: ExpenseCumulativeDay[]
  buyerLines: ExpenseBuyerLine[]
  details: ExpenseSlice[]
  buyers: ExpenseSlice[]
}

function walkDays(from: string, to: string) {
  const days: string[] = []
  let cursor = from
  while (cursor <= to && days.length < 400) {
    days.push(cursor)
    const next = addDays(cursor, 1)
    if (next <= cursor) break
    cursor = next
  }
  return days
}

function emptySlice(key: string, label: string): ExpenseSlice {
  return { key, label, paid: 0, pending: 0, installing: 0, covered: 0 }
}

function sliceTotal(slice: ExpenseSlice) {
  return slice.paid + slice.pending + slice.installing + slice.covered
}

export function expenseStats(expenses: readonly Expense[], from: string, to: string, today: string): ExpenseStats {
  const horizon = expenseHorizon(from, to)
  const days = walkDays(horizon.from, horizon.to)
  const inWindow = new Set(days)
  const perDay = new Map<string, ExpenseDay>(
    days.map((day) => [day, { day, paid: 0, pending: 0, installing: 0, covered: 0 }]),
  )
  const dailyByBuyer = new Map<string, Map<string, number>>()
  const buyers = new Map<string, ExpenseSlice>()
  const details = new Map<ExpenseDetail, ExpenseSlice>(
    EXPENSE_DETAILS.map((detail) => [detail, emptySlice(detail, EXPENSE_DETAIL_LABEL[detail])]),
  )
  const seen = {
    paid: new Set<string>(),
    pending: new Set<string>(),
    installing: new Set<string>(),
    covered: new Set<string>(),
  }
  let paidAmount = 0
  let pendingAmount = 0
  let installingAmount = 0
  let coveredAmount = 0
  let stillOwed = 0

  for (const expense of expenses) {
    for (const portion of expensePortions(expense)) {
      if (portion.bucket === 'pending' || (portion.bucket === 'installing' && portion.date > today)) stillOwed += portion.amount
      if (!inWindow.has(portion.date)) continue
      const day = perDay.get(portion.date)
      const detail = details.get(expense.detail) ?? emptySlice(expense.detail, EXPENSE_DETAIL_LABEL[expense.detail])
      const buyer = buyers.get(expense.personId) ?? emptySlice(expense.personId, expense.buyerName)
      const buyerDay = dailyByBuyer.get(expense.personId) ?? new Map<string, number>()
      buyerDay.set(portion.date, (buyerDay.get(portion.date) ?? 0) + portion.amount)
      dailyByBuyer.set(expense.personId, buyerDay)
      if (portion.bucket === 'paid') {
        paidAmount += portion.amount
        seen.paid.add(expense.id)
        if (day) day.paid += portion.amount
        detail.paid += portion.amount
        buyer.paid += portion.amount
      } else if (portion.bucket === 'pending') {
        pendingAmount += portion.amount
        seen.pending.add(expense.id)
        if (day) day.pending += portion.amount
        detail.pending += portion.amount
        buyer.pending += portion.amount
      } else if (portion.bucket === 'covered') {
        coveredAmount += portion.amount
        seen.covered.add(expense.id)
        if (day) day.covered += portion.amount
        detail.covered += portion.amount
        buyer.covered += portion.amount
      } else {
        installingAmount += portion.amount
        seen.installing.add(expense.id)
        if (day) day.installing += portion.amount
        detail.installing += portion.amount
        buyer.installing += portion.amount
      }
      details.set(expense.detail, detail)
      buyers.set(expense.personId, buyer)
    }
  }

  const buyerList = [...buyers.values()].sort(
    (left, right) => sliceTotal(right) - sliceTotal(left) || left.label.localeCompare(right.label, 'es'),
  )
  const buyerLines: ExpenseBuyerLine[] = buyerList.map((buyer, index) => ({
    key: buyer.key,
    label: buyer.label,
    color: CAREGIVER_LINE_COLORS[index % CAREGIVER_LINE_COLORS.length] ?? '#0f766e',
    total: sliceTotal(buyer),
  }))
  const running = new Map(buyerLines.map((buyer) => [buyer.key, 0]))
  const cumulativeDays: ExpenseCumulativeDay[] = days.map((day) => {
    const amounts: Record<string, number> = {}
    let total = 0
    for (const buyer of buyerLines) {
      const next = (running.get(buyer.key) ?? 0) + (dailyByBuyer.get(buyer.key)?.get(day) ?? 0)
      running.set(buyer.key, next)
      amounts[buyer.key] = next
      total += next
    }
    return { day, total, amounts }
  })

  return {
    from: horizon.from,
    to: horizon.to,
    paidAmount,
    pendingAmount,
    installingAmount,
    coveredAmount,
    paidCount: seen.paid.size,
    pendingCount: seen.pending.size,
    installingCount: seen.installing.size,
    coveredCount: seen.covered.size,
    stillOwed,
    contributedAmount: paidAmount + pendingAmount + installingAmount + coveredAmount,
    days: [...perDay.values()],
    cumulativeDays,
    buyerLines,
    details: EXPENSE_DETAILS.map((detail) => details.get(detail) ?? emptySlice(detail, EXPENSE_DETAIL_LABEL[detail])),
    buyers: buyerList,
  }
}

const CAREGIVER_LINE_COLORS = ['#0f766e', '#1d4ed8', '#c2410c', '#7c3aed', '#be123c', '#0369a1', '#a16207', '#334155']
