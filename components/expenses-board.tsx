'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { Role } from '@/lib/domain'
import {
  EXPENSE_DETAIL_LABEL,
  EXPENSE_DETAILS,
  EXPENSE_PAYMENT_LABEL,
  EXPENSE_PAYMENTS,
  expenseGroups,
  expenseLatest,
  expenseEarliest,
  formatPesos,
  type Expense,
  type ExpenseDetail,
  type ExpensePayment,
} from '@/lib/expenses/expense'
import { shortDate, todayISO } from '@/lib/schedule/dates'
import { api, errorText } from '@/components/api'
import { fieldClass } from '@/components/modal'

type Buyer = { id: string; name: string }
type Payload = { role: Role; people: Buyer[]; expenses: Expense[] }

const EMPTY = {
  spentOn: '',
  payment: 'pagado' as ExpensePayment,
  detail: 'medicamentos' as ExpenseDetail,
  personId: '',
  amount: '',
  installments: '',
  endsOn: '',
}

export function ExpensesBoard({ patientId }: { patientId: string }) {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const today = todayISO()
  const canEdit = payload?.role === 'owner' || payload?.role === 'caregiver'

  useEffect(() => {
    let cancelled = false
    api<Payload>(`/api/patients/${patientId}/expenses`)
      .then((data) => {
        if (cancelled) return
        setPayload(data)
        setError(null)
        setForm((current) => ({
          ...current,
          spentOn: current.spentOn || todayISO(),
          personId: current.personId || data.people[0]?.id || '',
        }))
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason) ?? 'No se pudieron cargar los gastos')
      })
    return () => {
      cancelled = true
    }
  }, [patientId])

  function apply(next: Payload) {
    setPayload(next)
    setFormError(null)
    setEditingId(null)
    setForm({
      ...EMPTY,
      spentOn: todayISO(),
      personId: next.people[0]?.id || '',
    })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canEdit || !form.personId) return
    const amount = Number(form.amount)
    setSaving(true)
    setFormError(null)
    try {
      const next = await api<Payload>(editingId ? `/api/expenses/${editingId}` : `/api/patients/${patientId}/expenses`, {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          personId: form.personId,
          spentOn: form.spentOn,
          payment: form.payment,
          detail: form.detail,
          amount,
          installments: form.payment === 'pagandose' ? Number(form.installments) : null,
          endsOn: form.payment === 'pagandose' ? form.endsOn : null,
        }),
      })
      apply(next)
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo guardar el gasto')
    } finally {
      setSaving(false)
    }
  }

  function edit(expense: Expense) {
    setEditingId(expense.id)
    setForm({
      spentOn: expense.spentOn,
      payment: expense.payment,
      detail: expense.detail,
      personId: expense.personId,
      amount: String(expense.amount),
      installments: expense.installments ? String(expense.installments) : '',
      endsOn: expense.endsOn ?? '',
    })
    setFormError(null)
  }

  async function remove(expense: Expense) {
    if (!window.confirm(`¿Quitar ${EXPENSE_DETAIL_LABEL[expense.detail]} de ${formatPesos(expense.amount)}?`)) return
    setSaving(true)
    setFormError(null)
    try {
      const next = await api<Payload>(`/api/expenses/${expense.id}`, { method: 'DELETE' })
      apply(next)
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo quitar el gasto')
    } finally {
      setSaving(false)
    }
  }

  const groups = payload ? expenseGroups(payload.expenses, today) : []
  const buyers = payload?.people ?? []
  const editingBuyerMissing = editingId != null && form.personId && !buyers.some((person) => person.id === form.personId)
  const editingBuyer = editingBuyerMissing
    ? payload?.expenses.find((expense) => expense.id === editingId)
    : null

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5">
      <header>
        <h1 className="text-2xl font-black">Gastos</h1>
        <p className="text-sm text-slate-600">
          Cada gasto lleva fecha, detalle, monto en pesos y quién lo pagó. La fecha puede ser futura. Si todavía no se
          paga, queda pendiente. Si se va pagando en cuotas, queda pagándose hasta la última fecha.
        </p>
      </header>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {!payload && !error ? <p className="text-sm text-slate-600">Cargando gastos…</p> : null}
      {payload && buyers.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Primero agrega a quien compra en Cuidadores. Tiene que ser una persona que pueda cuidar.
        </p>
      ) : null}
      {payload && canEdit && buyers.length > 0 ? (
        <form data-jump="Anotar gasto" onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-bold text-slate-700">
            Fecha
            <input
              type="date"
              required
              min={expenseEarliest(today)}
              max={expenseLatest(today)}
              value={form.spentOn}
              onChange={(event) => setForm({ ...form, spentOn: event.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-bold text-slate-700">
            Pago
            <select
              value={form.payment}
              onChange={(event) => setForm({ ...form, payment: event.target.value as ExpensePayment })}
              className={fieldClass}
            >
              {EXPENSE_PAYMENTS.map((payment) => (
                <option key={payment} value={payment}>
                  {EXPENSE_PAYMENT_LABEL[payment]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700">
            Detalle
            <select
              value={form.detail}
              onChange={(event) => setForm({ ...form, detail: event.target.value as ExpenseDetail })}
              className={fieldClass}
            >
              {EXPENSE_DETAILS.map((detail) => (
                <option key={detail} value={detail}>
                  {EXPENSE_DETAIL_LABEL[detail]}
                </option>
              ))}
            </select>
          </label>
          {form.payment === 'pagandose' ? (
            <>
              <label className="text-sm font-bold text-slate-700">
                Cuotas
                <input
                  required
                  inputMode="numeric"
                  min={2}
                  max={36}
                  step={1}
                  value={form.installments}
                  onChange={(event) => setForm({ ...form, installments: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Última cuota
                <input
                  type="date"
                  required
                  min={form.spentOn || expenseEarliest(today)}
                  value={form.endsOn}
                  onChange={(event) => setForm({ ...form, endsOn: event.target.value })}
                  className={fieldClass}
                />
              </label>
            </>
          ) : null}
          <label className="text-sm font-bold text-slate-700">
            Comprador
            <select
              required
              value={form.personId}
              onChange={(event) => setForm({ ...form, personId: event.target.value })}
              className={fieldClass}
            >
              {editingBuyer ? <option value={editingBuyer.personId}>{editingBuyer.buyerName}</option> : null}
              {buyers.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700">
            Monto
            <input
              required
              inputMode="numeric"
              min={1}
              step={1}
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="Pesos"
              className={fieldClass}
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {editingId ? 'Guardar cambio' : 'Anotar gasto'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => apply(payload)}
                className="rounded-full px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200"
              >
                Cancelar
              </button>
            ) : null}
          </div>
          {formError ? <p className="text-sm text-red-700 sm:col-span-2 lg:col-span-3">{formError}</p> : null}
        </form>
      ) : null}
      {payload && groups.length === 0 ? <p className="text-sm text-slate-600">Todavía no hay gastos.</p> : null}
      {groups.map((group) => (
        <div key={group.id} data-jump={group.title} className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="bg-slate-50 px-3 py-2 text-left text-xs font-black text-slate-800">{group.title}</caption>
            <thead>
              <tr className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Detalle</th>
                <th className="px-3 py-2">Comprador</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {group.rows.map((expense) => (
                <tr key={expense.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap font-bold text-slate-700">
                    {shortDate(expense.spentOn)} {expense.spentOn.slice(0, 4)}
                  </td>
                  <td className="px-3 py-2 font-bold text-slate-900">
                    {EXPENSE_DETAIL_LABEL[expense.detail]}
                    {expense.payment === 'pagandose' && expense.installments && expense.endsOn ? (
                      <span className="mt-0.5 block text-xs font-semibold text-blue-800">
                        {expense.installments} cuotas hasta {shortDate(expense.endsOn)} {expense.endsOn.slice(0, 4)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{expense.buyerName}</td>
                  <td
                    className={`px-3 py-2 text-right font-black tabular-nums ${
                      expense.payment === 'pendiente'
                        ? 'text-amber-800'
                        : expense.payment === 'pagandose'
                          ? 'text-blue-800'
                          : expense.payment === 'cubierto'
                            ? 'text-slate-400 line-through'
                            : 'text-slate-900'
                    }`}
                  >
                    {formatPesos(expense.amount)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {canEdit ? (
                      <>
                        <button type="button" onClick={() => edit(expense)} className="text-sm font-bold text-slate-700">
                          Corregir
                        </button>
                        <button type="button" onClick={() => remove(expense)} className="ml-3 text-sm font-bold text-red-700">
                          Quitar
                        </button>
                      </>
                    ) : (
                      <span className="text-xs font-bold text-slate-500">{EXPENSE_PAYMENT_LABEL[expense.payment]}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  )
}
