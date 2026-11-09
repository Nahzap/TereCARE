import { NextResponse } from 'next/server'
import { canEdit, context, jsonError, parseBody, requireRole, respond } from '@/lib/api/guard'
import { asRows } from '@/lib/api/map'
import { loadPeople, PEOPLE_MISSING, PeopleMissingError } from '@/lib/api/people'
import { mapPressure, pressureWrite, type PressureRow } from '@/lib/pressure/map'
import { pressureMeasuredAtBlock } from '@/lib/pressure/paste'
import { nextReadingOrder } from '@/lib/pressure/reading'
import { caregiverNote, pressureBodySchema } from '@/lib/pressure/schema'
import { todayISO } from '@/lib/schedule/dates'
import { localDateTimeToUtc, utcToLocalDateTime } from '@/lib/time/zoned'

type Context = { params: Promise<{ id: string }> }

const COLUMNS =
  'id, patient_id, measured_at, systolic, diastolic, pulse, day_part, reading_order, note, profiles(full_name, email)'

export async function GET(_request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response

    const { data, error } = await session.supabase
      .from('blood_pressure_readings')
      .select(COLUMNS)
      .eq('patient_id', id)
      .order('measured_at', { ascending: false })
    if (error) throw error

    let people: Awaited<ReturnType<typeof loadPeople>> = []
    try {
      people = await loadPeople(session.supabase, id)
    } catch (error) {
      if (!(error instanceof PeopleMissingError)) throw error
    }

    return NextResponse.json({
      role: access.role,
      readings: asRows<PressureRow>(data).map(mapPressure),
      people: people.map((person) => ({
        id: person.id,
        name: person.name,
        userId: person.userId,
        assignable: person.assignable,
      })),
    })
  })
}

export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response
    const { id } = await params
    const access = await requireRole(session.supabase, session.user.id, id)
    if ('response' in access) return access.response
    if (!canEdit(access.role)) return jsonError('No puedes registrar presión', 403)

    const body = await parseBody(request, pressureBodySchema)
    if ('response' in body) return body.response

    const today = todayISO()
    const nowLocal = utcToLocalDateTime(new Date().toISOString())
    const measuredLocal = body.data.measuredAt ?? `${nowLocal.date}T${nowLocal.time}`
    const block = pressureMeasuredAtBlock(measuredLocal, today)
    if (block === 'invalid') return jsonError('Usa fecha y hora AAAA-MM-DDTHH:mm', 400)
    if (block === 'past') return jsonError('Esa fecha queda fuera del historial', 400)
    if (block === 'future') return jsonError('No puedes anotar una medición tan adelante en el futuro', 400)

    let measuredAt: string
    try {
      measuredAt = localDateTimeToUtc(measuredLocal)
    } catch {
      return jsonError('Usa fecha y hora AAAA-MM-DDTHH:mm', 400)
    }

    let recordedBy = session.user.id
    let note = ''
    if (body.data.personId) {
      try {
        const people = await loadPeople(session.supabase, id)
        const person = people.find((entry) => entry.id === body.data.personId)
        if (!person) return jsonError('No encontramos a esa persona', 404)
        if (person.userId) {
          recordedBy = person.userId
          note = ''
        } else {
          recordedBy = session.user.id
          note = caregiverNote(person.name)
        }
      } catch (error) {
        if (error instanceof PeopleMissingError) return jsonError(PEOPLE_MISSING, 503)
        throw error
      }
    }

    const localDate = utcToLocalDateTime(measuredAt).date
    const sameDay = await session.supabase
      .from('blood_pressure_readings')
      .select('reading_order')
      .eq('patient_id', id)
      .gte('measured_at', localDateTimeToUtc(`${localDate}T00:00`))
      .lte('measured_at', localDateTimeToUtc(`${localDate}T23:59`))
    if (sameDay.error) throw sameDay.error
    const nextOrder = nextReadingOrder(
      asRows<{ reading_order: number | null }>(sameDay.data).flatMap((row) =>
        typeof row.reading_order === 'number' ? [row.reading_order] : [],
      ),
    )
    // DB allows reading_order 1..2; further readings of the same day stay unnumbered.
    const readingOrder = nextOrder <= 2 ? nextOrder : null

    const { data, error } = await session.supabase
      .from('blood_pressure_readings')
      .insert({
        patient_id: id,
        ...pressureWrite(body.data, measuredAt, readingOrder, recordedBy, note),
      })
      .select(COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('No se pudo guardar la presión')
    return NextResponse.json(mapPressure(data as PressureRow), { status: 201 })
  })
}
