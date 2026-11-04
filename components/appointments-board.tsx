'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  APPOINTMENT_STATUSES,
  appointmentDayLabel,
  groupAppointments,
  STATUS_LABEL,
  type AppointmentStatus,
} from '@/lib/appointments/ordering'
import type { Appointment } from '@/lib/appointments/map'
import type { Role } from '@/lib/domain'
import { shortDate, todayISO } from '@/lib/schedule/dates'
import { utcToLocalDateTime } from '@/lib/time/zoned'
import { api, errorText } from '@/components/api'

type Payload = { role: Role; appointments: Appointment[] }
type Listed = Appointment & { localDate: string }
type Draft = {
  date: string
  time: string
  professionalName: string
  place: string
  companion: string
  reason: string
  status: AppointmentStatus
}

const cell =
  'box-border w-full min-w-0 rounded-lg bg-white px-2 py-2 text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-300'

const gridCols =
  'grid grid-cols-[9.5rem_6.75rem_minmax(9rem,1.4fr)_minmax(8rem,1.2fr)_minmax(8rem,1fr)_minmax(8rem,1.2fr)_9.25rem_6.75rem] gap-x-3'

function draftFrom(item: Appointment): Draft {
  const local = utcToLocalDateTime(item.startsAt)
  return {
    date: local.date,
    time: local.time.slice(0, 5),
    professionalName: item.professionalName,
    place: item.place,
    companion: item.companion,
    reason: item.reason,
    status: item.status,
  }
}

function draftBody(draft: Draft) {
  return {
    professionalName: draft.professionalName.trim(),
    place: draft.place.trim(),
    startsAt: `${draft.date}T${draft.time}`,
    reason: draft.reason.trim(),
    companion: draft.companion.trim(),
    status: draft.status,
  }
}

export function AppointmentsBoard({ patientId }: { patientId: string }) {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const professionalRef = useRef<HTMLInputElement>(null)
  const canEdit = payload?.role === 'owner' || payload?.role === 'caregiver'
  const today = todayISO()

  useEffect(() => {
    let cancelled = false
    api<Payload>(`/api/patients/${patientId}/appointments`)
      .then((data) => {
        if (!cancelled) {
          setPayload(data)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason) ?? 'No se pudieron cargar las citas')
      })
    return () => {
      cancelled = true
    }
  }, [patientId])

  const rows = useMemo(() => {
    const listed: Listed[] = (payload?.appointments ?? []).map((item) => ({
      ...item,
      localDate: utcToLocalDateTime(item.startsAt).date,
    }))
    const groups = groupAppointments(listed, today)
    // Cercana → lejana en lo pendiente; historial cronológico al final.
    return [...groups.overdue, ...groups.upcoming, ...groups.past]
  }, [payload, today])

  function replaceAppointment(next: Appointment) {
    setPayload((current) =>
      current
        ? {
            ...current,
            appointments: current.appointments.map((item) => (item.id === next.id ? next : item)),
          }
        : current,
    )
  }

  function dropAppointment(id: string) {
    setPayload((current) =>
      current
        ? {
            ...current,
            appointments: current.appointments.filter((item) => item.id !== id),
          }
        : current,
    )
  }

  function beginEdit(item: Appointment) {
    setEditingId(item.id)
    setDraft(draftFrom(item))
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editingId) return
    const form = event.currentTarget
    const data = new FormData(form)
    const date = String(data.get('date') ?? '')
    const time = String(data.get('time') ?? '').slice(0, 5)
    setSaving(true)
    setError(null)
    try {
      const created = await api<Appointment>(`/api/patients/${patientId}/appointments`, {
        method: 'POST',
        body: JSON.stringify({
          professionalName: String(data.get('professionalName') ?? ''),
          place: String(data.get('place') ?? ''),
          startsAt: `${date}T${time}`,
          reason: String(data.get('reason') ?? ''),
          companion: String(data.get('companion') ?? ''),
          status: String(data.get('status') ?? 'programada'),
        }),
      })
      setPayload((current) =>
        current ? { ...current, appointments: [...current.appointments, created] } : { role: 'caregiver', appointments: [created] },
      )
      form.reset()
      professionalRef.current?.focus()
    } catch (reason) {
      setError(errorText(reason) ?? 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingId || !draft) return
    if (!draft.professionalName.trim() || !draft.place.trim() || !draft.date || !draft.time) {
      setError('Completa fecha, hora, profesional y lugar')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await api<Appointment>(`/api/appointments/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(draftBody(draft)),
      })
      replaceAppointment(updated)
      cancelEdit()
    } catch (reason) {
      setError(errorText(reason) ?? 'No se pudo guardar el cambio')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(item: Appointment, status: AppointmentStatus) {
    if (status === item.status || editingId) return
    const previous = item
    replaceAppointment({ ...item, status })
    setError(null)
    const local = utcToLocalDateTime(item.startsAt)
    try {
      const updated = await api<Appointment>(`/api/appointments/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          professionalName: item.professionalName,
          place: item.place,
          startsAt: local.value,
          reason: item.reason,
          companion: item.companion,
          status,
        }),
      })
      replaceAppointment(updated)
    } catch (reason) {
      replaceAppointment(previous)
      setError(errorText(reason) ?? 'No se pudo actualizar')
    }
  }

  async function remove(item: Appointment) {
    if (!window.confirm(`¿Quitar la cita con ${item.professionalName}?`)) return
    setSaving(true)
    setError(null)
    try {
      await api(`/api/appointments/${item.id}`, { method: 'DELETE' })
      if (editingId === item.id) cancelEdit()
      dropAppointment(item.id)
    } catch (reason) {
      setError(errorText(reason) ?? 'No se pudo quitar la cita')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5">
      <header>
        <h1 className="text-2xl font-black">Citas médicas</h1>
        <p className="text-sm text-slate-600">
          Ordenadas por fecha y hora, de la más cercana a la más lejana, para seguir la trazabilidad del cuidado. Usa
          Corregir para enmendar una cita ya anotada.
        </p>
      </header>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <div data-jump="Listado" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <div className="min-w-[1080px]">
          <div className={`${gridCols} bg-slate-900 px-2 text-white`}>
            {['Fecha', 'Hora', 'Profesional', 'Lugar', 'Acompañante', 'Motivo', 'Estado', ''].map((label) => (
              <div key={label || 'accion'} className="overflow-hidden px-2 py-2 text-xs font-bold whitespace-nowrap uppercase">
                {label}
              </div>
            ))}
          </div>
          {canEdit ? (
            <form
              data-jump="Registrar"
              onSubmit={submit}
              className={`${gridCols} items-center border-b border-blue-100 bg-blue-50 px-2 py-2`}
            >
              <input name="date" type="date" required aria-label="Fecha" className={cell} />
              <input name="time" type="time" required aria-label="Hora" className={cell} />
              <input
                ref={professionalRef}
                name="professionalName"
                required
                maxLength={120}
                aria-label="Profesional"
                placeholder="Nombre"
                autoFocus
                className={cell}
              />
              <input name="place" required maxLength={160} aria-label="Lugar" placeholder="Lugar" className={cell} />
              <input name="companion" maxLength={120} aria-label="Acompañante" placeholder="Nombre" className={cell} />
              <input name="reason" maxLength={200} aria-label="Motivo" placeholder="Motivo" className={cell} />
              <select name="status" aria-label="Estado" defaultValue="programada" className={cell}>
                <StatusOptions />
              </select>
              <button
                type="submit"
                disabled={saving || editingId != null}
                className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving && !editingId ? '…' : 'Registrar'}
              </button>
            </form>
          ) : null}
          {payload && rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Todavía no hay citas.</p>
          ) : null}
          {rows.map((item) => {
            const local = utcToLocalDateTime(item.startsAt)
            const todayMark = appointmentDayLabel(item.localDate, today) === 'hoy'
            const editing = canEdit && editingId === item.id && draft != null

            if (editing && draft) {
              return (
                <form
                  key={item.id}
                  onSubmit={saveEdit}
                  className={`${gridCols} items-center border-t border-amber-200 bg-amber-50 px-2 py-2`}
                >
                  <input
                    type="date"
                    required
                    aria-label="Fecha"
                    value={draft.date}
                    onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                    className={cell}
                  />
                  <input
                    type="time"
                    required
                    aria-label="Hora"
                    value={draft.time}
                    onChange={(event) => setDraft({ ...draft, time: event.target.value.slice(0, 5) })}
                    className={cell}
                  />
                  <input
                    required
                    maxLength={120}
                    aria-label="Profesional"
                    value={draft.professionalName}
                    onChange={(event) => setDraft({ ...draft, professionalName: event.target.value })}
                    className={cell}
                  />
                  <input
                    required
                    maxLength={160}
                    aria-label="Lugar"
                    value={draft.place}
                    onChange={(event) => setDraft({ ...draft, place: event.target.value })}
                    className={cell}
                  />
                  <input
                    maxLength={120}
                    aria-label="Acompañante"
                    value={draft.companion}
                    onChange={(event) => setDraft({ ...draft, companion: event.target.value })}
                    className={cell}
                  />
                  <input
                    maxLength={200}
                    aria-label="Motivo"
                    value={draft.reason}
                    onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                    className={cell}
                  />
                  <select
                    aria-label="Estado"
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value as AppointmentStatus })}
                    className={cell}
                  >
                    <StatusOptions />
                  </select>
                  <div className="flex flex-col gap-1">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {saving ? '…' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="rounded-lg px-3 py-1 text-sm font-bold text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )
            }

            return (
              <div key={item.id} className={`${gridCols} items-center border-t border-slate-200 px-2 py-2 ${todayMark ? 'bg-amber-50' : ''}`}>
                <div className="px-2 text-sm font-bold tabular-nums">
                  {shortDate(local.date)}
                  {todayMark ? ' · hoy' : ''}
                </div>
                <div className="px-2 text-sm font-black tabular-nums">{local.time}</div>
                <div className="truncate px-2 font-black" title={item.professionalName}>
                  {item.professionalName}
                </div>
                <div className="truncate px-2 text-sm font-semibold text-slate-800" title={item.place}>
                  {item.place}
                </div>
                <div className="truncate px-2 text-sm font-semibold text-slate-800">{item.companion || '—'}</div>
                <div className="truncate px-2 text-sm text-slate-700">{item.reason || '—'}</div>
                <div className="px-2">
                  {canEdit ? (
                    <select
                      aria-label={`Estado de ${item.professionalName}`}
                      value={item.status}
                      disabled={editingId != null || saving}
                      onChange={(event) => setStatus(item, event.target.value as AppointmentStatus)}
                      className={cell}
                    >
                      <StatusOptions />
                    </select>
                  ) : (
                    <span className="text-sm font-bold">{STATUS_LABEL[item.status]}</span>
                  )}
                </div>
                <div className="flex flex-col items-start gap-1 px-1">
                  {canEdit ? (
                    <>
                      <button
                        type="button"
                        onClick={() => beginEdit(item)}
                        disabled={saving || editingId != null}
                        className="text-sm font-bold text-slate-700 disabled:opacity-40"
                      >
                        Corregir
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(item)}
                        disabled={saving || editingId != null}
                        className="text-sm font-bold text-red-700 disabled:opacity-40"
                      >
                        Quitar
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function StatusOptions() {
  return APPOINTMENT_STATUSES.map((status) => (
    <option key={status} value={status}>
      {STATUS_LABEL[status]}
    </option>
  ))
}
