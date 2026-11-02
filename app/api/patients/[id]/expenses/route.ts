import { NextResponse } from 'next/server'
import { canEdit, context, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { EXPENSES_MISSING, expensesMissing, loadExpenses } from '@/lib/api/expenses'
import { loadPeople, PEOPLE_MISSING, PeopleMissingError } from '@/lib/api/people'
import { expenseBodySchema, expensePlanError } from '@/lib/expenses/expense'
import { todayISO } from '@/lib/schedule/dates'

type Context = { params: Promise<{ id: string }> }

async function read(supabase: Parameters<typeof loadExpenses>[0], patientId: string, role: string) {
  const [expenses, people] = await Promise.all([loadExpenses(supabase, patientId), loadPeople(supabase, patientId)])
  if (expenses == null) return jsonError(EXPENSES_MISSING, 503)
  return NextResponse.json({
    role,
    people: people.filter((person) => person.assignable).map((person) => ({ id: person.id, name: person.name })),
    expenses,
  })
}

export async function GET(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    try {
      return await read(session.supabase, id, access.role)
    } catch (error) {
      if (error instanceof PeopleMissingError) return jsonError(PEOPLE_MISSING, 503)
      throw error
    }
  })
}

export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes anotar gastos', 403)

    const body = await parseBody(request, expenseBodySchema)
    if ('response' in body) return body.response
    const planError = expensePlanError(body.data, todayISO())
    if (planError) return jsonError(planError, 400)

    try {
      const buyer = (await loadPeople(session.supabase, id)).find((person) => person.id === body.data.personId)
      if (!buyer || !buyer.assignable) return jsonError('Esa persona no puede quedar como comprador', 400)

      const inserted = await session.supabase.from('care_expenses').insert({
        patient_id: id,
        person_id: body.data.personId,
        spent_on: body.data.spentOn,
        payment: body.data.payment,
        detail: body.data.detail,
        amount: body.data.amount,
        installments: body.data.payment === 'pagandose' ? body.data.installments : null,
        ends_on: body.data.payment === 'pagandose' ? body.data.endsOn : null,
        recorded_by: session.user.id,
      })
      if (expensesMissing(inserted.error)) return jsonError(EXPENSES_MISSING, 503)
      const known = inserted.error?.message ?? ''
      if (known.includes('comprador') || known.includes('esta ficha') || known.includes('historial') || known.includes('un año') || known.includes('cinco años') || known.includes('cuota')) {
        return jsonError(known, 400)
      }
      if (inserted.error) throw inserted.error
      return await read(session.supabase, id, access.role)
    } catch (error) {
      if (error instanceof PeopleMissingError) return jsonError(PEOPLE_MISSING, 503)
      throw error
    }
  })
}
