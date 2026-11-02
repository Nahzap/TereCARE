import { NextResponse } from 'next/server'
import { context, jsonError, requireRole, respond } from '@/lib/api/guard'
import { coverageView, isTotalScope, readTotals, totalsRange } from '@/lib/coverage/schedule'
import { todayISO } from '@/lib/schedule/dates'

type Context = { params: Promise<{ id: string }> }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MISSING =
  'Los totales de horas todavía no están listos. Falta aplicar la migración en la base de datos.'

function schemaMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false
  if (error.code === 'PGRST202' || error.code === '42883') return true
  const message = error.message ?? ''
  return message.includes('schema cache') && message.includes('care_coverage_totals')
}

export async function GET(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const query = new URL(request.url).searchParams
    const scope = query.get('scope')
    if (!isTotalScope(scope)) return jsonError('Elige días a la vista, mes, año o todo el historial', 400)
    const start = query.get('from')
    if (start && !ISO_DATE.test(start)) return jsonError('Usa una fecha en formato AAAA-MM-DD', 400)

    const range = totalsRange(scope, coverageView(todayISO(), start))
    const { data, error } = await session.supabase.rpc('care_coverage_totals', {
      p_patient_id: id,
      p_from: range.from,
      p_to: range.to,
    })
    if (schemaMissing(error)) return jsonError(MISSING, 503)
    if (error) throw error

    return NextResponse.json(readTotals(data, scope, range))
  })
}
