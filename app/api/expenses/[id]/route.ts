import { canEdit, context, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { EXPENSES_MISSING, expensesMissing, loadExpenses } from '@/lib/api/expenses'
import { loadPeople, PEOPLE_MISSING, PeopleMissingError } from '@/lib/api/people'
import { expenseBodySchema, expensePlanError } from '@/lib/expenses/expense'
import { todayISO } from '@/lib/schedule/dates'
import { NextResponse } from 'next/server'

type Context = { params: Promise<{ id: string }> }

function knownExpenseError(error: { message?: string } | null) {
  const message = error?.message ?? ''
  if (
    message.includes('historial') ||
    message.includes('un año') ||
    message.includes('cinco años') ||
    message.includes('cuota') ||
    message.includes('comprador') ||
    message.includes('no es de esta ficha')
  ) {
    return message
  }
  return null
}

async function read(supabase: Parameters<typeof loadExpenses>[0], patientId: string, role: string) {
  const [expenses, people] = await Promise.all([loadExpenses(supabase, patientId), loadPeople(supabase, patientId)])
  if (expenses == null) return jsonError(EXPENSES_MISSING, 503)
  return NextResponse.json({
    role,
    people: people.filter((person) => person.assignable).map((person) => ({ id: person.id, name: person.name })),
    expenses,
  })
}

export async function PATCH(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const found = await session.supabase.from('care_expenses').select('id, patient_id, person_id').eq('id', id).maybeSingle()
    if (expensesMissing(found.error)) return jsonError(EXPENSES_MISSING, 503)
    const known = knownExpenseError(found.error)
    if (known) return jsonError(known, 400)
    if (found.error) throw found.error
    if (!found.data) return jsonError('No encontramos ese gasto', 404)

    const access = await requireRole(session.supabase, session.user.id, found.data.patient_id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes corregir gastos', 403)

    const body = await parseBody(request, expenseBodySchema)
    if ('response' in body) return body.response
    const planError = expensePlanError(body.data, todayISO())
    if (planError) return jsonError(planError, 400)

    try {
      if (body.data.personId !== found.data.person_id) {
        const buyer = (await loadPeople(session.supabase, found.data.patient_id)).find((person) => person.id === body.data.personId)
        if (!buyer || !buyer.assignable) return jsonError('Esa persona no puede quedar como comprador', 400)
      }

      const updated = await session.supabase
        .from('care_expenses')
        .update({
          person_id: body.data.personId,
          spent_on: body.data.spentOn,
          payment: body.data.payment,
          detail: body.data.detail,
          note: body.data.note,
          amount: body.data.amount,
          installments: body.data.payment === 'pagandose' ? body.data.installments : null,
          ends_on: body.data.payment === 'pagandose' ? body.data.endsOn : null,
        })
        .eq('id', id)
        .eq('patient_id', found.data.patient_id)
      if (expensesMissing(updated.error)) return jsonError(EXPENSES_MISSING, 503)
      const updateError = knownExpenseError(updated.error)
      if (updateError) return jsonError(updateError, 400)
      if (updated.error) throw updated.error
      return await read(session.supabase, found.data.patient_id, access.role)
    } catch (error) {
      if (error instanceof PeopleMissingError) return jsonError(PEOPLE_MISSING, 503)
      throw error
    }
  })
}

export async function DELETE(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const found = await session.supabase.from('care_expenses').select('id, patient_id').eq('id', id).maybeSingle()
    if (expensesMissing(found.error)) return jsonError(EXPENSES_MISSING, 503)
    if (found.error) throw found.error
    if (!found.data) return jsonError('No encontramos ese gasto', 404)

    const access = await requireRole(session.supabase, session.user.id, found.data.patient_id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes quitar gastos', 403)

    try {
      const removed = await session.supabase.from('care_expenses').delete().eq('id', id).eq('patient_id', found.data.patient_id)
      if (expensesMissing(removed.error)) return jsonError(EXPENSES_MISSING, 503)
      if (removed.error) throw removed.error
      return await read(session.supabase, found.data.patient_id, access.role)
    } catch (error) {
      if (error instanceof PeopleMissingError) return jsonError(PEOPLE_MISSING, 503)
      throw error
    }
  })
}
