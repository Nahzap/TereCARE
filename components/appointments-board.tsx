'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

const cell =
  'box-border w-full min-w-0 rounded-lg bg-white px-2 py-2 text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-300'

const gridCols =
  'grid grid-cols-[9.5rem_6.75rem_minmax(9rem,1.4fr)_minmax(8rem,1.2fr)_minmax(8rem,1fr)_minmax(8rem,1.2fr)_9.25rem_6.75rem] gap-x-3'

export function AppointmentsBoard({ patientId }: { patientId: string }) {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
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
  }, [patientId, reloadToken])

  const rows = useMemo(() => {
    const listed: Listed[] = (payload?.appointments ?? []).map((item) => ({
      ...item,
      localDate: utcToLocalDateTime(item.startsAt).date,
    }))
    const groups = groupAppointments(listed, today)
    return [...groups.overdue, ...groups.upcoming, ...groups.past]
  }, [payload, today])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const date = String(data.get('date') ?? '')
    const time = String(data.get('time') ?? '').slice(0, 5)
    setSaving(true)
    setError(null)
    try {
      await api(`/api/patients/${patientId}/appointments`, {
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
      form.reset()
      professionalRef.current?.focus()
      setReloadToken((value) => value + 1)
    } catch (reason) {
      setError(errorText(reason) ?? 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(item: Appointment, status: AppointmentStatus) {
    const local = utcToLocalDateTime(item.startsAt)
    try {
      await api(`/api/appointments/${item.id}`, {
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
      setReloadToken((value) => value + 1)
    } catch (reason) {
      setError(errorText(reason) ?? 'No se pudo actualizar')
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5">
      <header>
        <h1 className="text-2xl font-black">Citas médicas</h1>
        <p className="text-sm text-slate-600">Profesional, lugar, fecha, hora, motivo, acompañante y estado, en una sola fila.</p>
      </header>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <form id="appointment-entry" onSubmit={submit} />
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
            <div data-jump="Registrar" className={`${gridCols} items-center border-b border-blue-100 bg-blue-50 px-2 py-2`}>
              <input form="appointment-entry" name="date" type="date" required aria-label="Fecha" className={cell} />
              <input form="appointment-entry" name="time" type="time" required aria-label="Hora" className={cell} />
              <input
                ref={professionalRef}
                form="appointment-entry"
                name="professionalName"
                required
                maxLength={120}
                aria-label="Profesional"
                placeholder="Nombre"
                autoFocus
                className={cell}
              />
              <input form="appointment-entry" name="place" required maxLength={160} aria-label="Lugar" placeholder="Lugar" className={cell} />
              <input form="appointment-entry" name="companion" maxLength={120} aria-label="Acompañante" placeholder="Nombre" className={cell} />
              <input form="appointment-entry" name="reason" maxLength={200} aria-label="Motivo" placeholder="Motivo" className={cell} />
              <select form="appointment-entry" name="status" aria-label="Estado" defaultValue="programada" className={cell}>
                <StatusOptions />
              </select>
              <button
                form="appointment-entry"
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? '…' : 'Registrar'}
              </button>
            </div>
          ) : null}
          {payload && rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Todavía no hay citas.</p>
          ) : null}
          {rows.map((item) => {
            const local = utcToLocalDateTime(item.startsAt)
            const todayMark = appointmentDayLabel(item.localDate, today) === 'hoy'
            return (
              <div key={item.id} className={`${gridCols} items-center border-t border-slate-200 px-2 py-2 ${todayMark ? 'bg-amber-50' : ''}`}>
                <div className="px-2 text-sm font-bold tabular-nums">
                  {shortDate(local.date)}
                  {todayMark ? ' · hoy' : ''}
                </div>
                <div className="px-2 text-sm font-black tabular-nums">{local.time}</div>
                <div className="truncate px-2 font-black">{item.professionalName}</div>
                <div className="truncate px-2 text-sm font-semibold text-slate-800">{item.place}</div>
                <div className="truncate px-2 text-sm font-semibold text-slate-800">{item.companion || '—'}</div>
                <div className="truncate px-2 text-sm text-slate-700">{item.reason || '—'}</div>
                <div className="px-2">
                  {canEdit ? (
                    <select
                      aria-label={`Estado de ${item.professionalName}`}
                      value={item.status}
                      onChange={(event) => setStatus(item, event.target.value as AppointmentStatus)}
                      className={cell}
                    >
                      <StatusOptions />
                    </select>
                  ) : (
                    <span className="text-sm font-bold">{STATUS_LABEL[item.status]}</span>
                  )}
                </div>
                <div />
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
