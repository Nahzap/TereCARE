import type { AppClient } from '@/lib/api/guard'
import { asRows, normalizeDate } from '@/lib/api/map'
import { type Expense, type ExpenseDetail, type ExpensePayment, EXPENSE_DETAILS } from '@/lib/expenses/expense'

export const EXPENSES_MISSING =
  'Los gastos todavía no están listos. Falta aplicar la migración en la base de datos.'

const COLUMNS = 'id, patient_id, person_id, spent_on, payment, detail, amount, installments, ends_on, care_people(display_name)'

type ExpenseRow = {
  id: string
  patient_id: string
  person_id: string
  spent_on: string
  payment: string
  detail: string
  amount: number
  installments: number | null
  ends_on: string | null
  care_people: { display_name: string } | { display_name: string }[] | null
}

export function expensesMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (['PGRST202', 'PGRST205', '42P01', '42703', '42883'].includes(error.code ?? '')) return true
  const message = error.message ?? ''
  return message.includes('schema cache') && message.includes('care_expense')
}

function buyerName(value: ExpenseRow['care_people']) {
  const row = Array.isArray(value) ? value[0] : value
  const name = row?.display_name?.trim()
  return name || 'Cuidador'
}

function asDetail(value: string): ExpenseDetail {
  return EXPENSE_DETAILS.includes(value as ExpenseDetail) ? (value as ExpenseDetail) : 'otros'
}

function asPayment(value: string): ExpensePayment {
  if (value === 'pendiente' || value === 'pagandose' || value === 'cubierto') return value
  return 'pagado'
}

export function mapExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    spentOn: normalizeDate(row.spent_on) ?? row.spent_on,
    payment: asPayment(row.payment),
    detail: asDetail(row.detail),
    amount: row.amount,
    personId: row.person_id,
    buyerName: buyerName(row.care_people),
    installments: row.installments,
    endsOn: normalizeDate(row.ends_on),
  }
}

export async function loadExpenses(supabase: AppClient, patientId: string): Promise<Expense[] | null> {
  const { data, error } = await supabase
    .from('care_expenses')
    .select(COLUMNS)
    .eq('patient_id', patientId)
    .order('spent_on', { ascending: false })
    .order('amount', { ascending: false })
  if (expensesMissing(error)) return null
  if (error) throw error
  return asRows<ExpenseRow>(data).map(mapExpense)
}
