'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import type { Role } from '@/lib/domain'
import type { PressureReading } from '@/lib/pressure/map'
import { nextOrderForDay } from '@/lib/pressure/reading'
import { shortDate, todayISO } from '@/lib/schedule/dates'
import { utcToLocalDateTime } from '@/lib/time/zoned'
import { api, errorText } from '@/components/api'

type Payload = { role: Role; readings: PressureReading[] }

const cell =
  'w-full bg-transparent px-2 py-3 text-center text-2xl font-black tabular-nums text-slate-900 outline-none placeholder:text-slate-300'

export function PressureBoard({ patientId }: { patientId: string }) {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const systolicRef = useRef<HTMLInputElement>(null)
  const [clock, setClock] = useState('')
  const canEdit = payload?.role === 'owner' || payload?.role === 'caregiver'
  const nextOrder = nextOrderForDay(
    (payload?.readings ?? []).map((reading) => ({
      localDate: utcToLocalDateTime(reading.measuredAt).date,
      readingOrder: reading.readingOrder,
    })),
    todayISO(),
  )

  useEffect(() => {
    const tick = () => setClock(utcToLocalDateTime(new Date().toISOString()).time)
    const start = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api<Payload>(`/api/patients/${patientId}/pressure`)
      .then((data) => {
        if (!cancelled) {
          setPayload(data)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason) ?? 'No se pudo cargar la presión')
      })
    return () => {
      cancelled = true
    }
  }, [patientId, reloadToken])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const pulse = String(data.get('pulse') ?? '').trim()
    setSaving(true)
    setError(null)
    try {
      await api(`/api/patients/${patientId}/pressure`, {
        method: 'POST',
        body: JSON.stringify({
          systolic: Number(data.get('systolic')),
          diastolic: Number(data.get('diastolic')),
          pulse: pulse ? Number(pulse) : null,
        }),
      })
      form.reset()
      systolicRef.current?.focus()
      setReloadToken((value) => value + 1)
    } catch (reason) {
      setError(errorText(reason) ?? 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function remove(reading: PressureReading) {
    if (!window.confirm(`¿Eliminar ${reading.systolic}/${reading.diastolic}?`)) return
    try {
      await api(`/api/pressure/${reading.id}`, { method: 'DELETE' })
      setReloadToken((value) => value + 1)
    } catch (reason) {
      setError(errorText(reason) ?? 'No se pudo eliminar')
    }
  }

  let lastDate = ''

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5">
      <header>
        <h1 className="text-2xl font-black">Presión arterial</h1>
        <p className="text-sm text-slate-600">Sistólica, diastólica y pulso. La hora y el número de lectura se anotan solos.</p>
      </header>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <form id="pressure-entry" onSubmit={submit} />
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="px-3 py-2 text-xs font-bold uppercase">Hora</th>
              <th className="px-3 py-2 text-xs font-bold uppercase">Lectura</th>
              <th className="px-3 py-2 text-center text-xs font-bold uppercase">Sistólica</th>
              <th className="px-3 py-2 text-center text-xs font-bold uppercase">Diastólica</th>
              <th className="px-3 py-2 text-center text-xs font-bold uppercase">Pulso</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {canEdit ? (
              <tr data-jump="Registrar" className="border-b border-blue-100 bg-blue-50">
                <td className="px-3 py-3 text-lg font-black tabular-nums text-slate-900">{clock}</td>
                <td className="px-3 py-3 text-lg font-black tabular-nums text-slate-900">{nextOrder}</td>
                <td className="p-1">
                  <input
                    ref={systolicRef}
                    form="pressure-entry"
                    name="systolic"
                    type="number"
                    inputMode="numeric"
                    required
                    min={60}
                    max={260}
                    aria-label="Sistólica"
                    placeholder="120"
                    autoFocus
                    className={`${cell} rounded-lg bg-white`}
                  />
                </td>
                <td className="p-1">
                  <input
                    form="pressure-entry"
                    name="diastolic"
                    type="number"
                    inputMode="numeric"
                    required
                    min={40}
                    max={160}
                    aria-label="Diastólica"
                    placeholder="80"
                    className={`${cell} rounded-lg bg-white`}
                  />
                </td>
                <td className="p-1">
                  <input
                    form="pressure-entry"
                    name="pulse"
                    type="number"
                    inputMode="numeric"
                    min={30}
                    max={220}
                    aria-label="Pulso"
                    placeholder="70"
                    className={`${cell} rounded-lg bg-white`}
                  />
                </td>
                <td className="px-2 py-2">
                  <button
                    form="pressure-entry"
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {saving ? '…' : 'Registrar'}
                  </button>
                </td>
              </tr>
            ) : null}
            {payload && payload.readings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  Todavía no hay mediciones.
                </td>
              </tr>
            ) : null}
            {payload?.readings.map((reading) => {
              const local = utcToLocalDateTime(reading.measuredAt)
              const showDate = local.date !== lastDate
              lastDate = local.date
              return (
                <Fragment key={reading.id}>
                  {showDate ? (
                    <tr className="bg-slate-100">
                      <td colSpan={6} data-jump={`${shortDate(local.date)} ${local.date.slice(0, 4)}`} className="px-3 py-1.5 text-xs font-black tracking-wide text-slate-600 uppercase">
                        {shortDate(local.date)} {local.date.slice(0, 4)}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="border-t border-slate-200">
                    <td className="px-3 py-3 text-sm font-bold tabular-nums text-slate-700">{local.time}</td>
                    <td className="px-3 py-3 text-sm font-black tabular-nums">{reading.readingOrder ?? '—'}</td>
                    <td className="px-3 py-3 text-center text-xl font-black tabular-nums">{reading.systolic}</td>
                    <td className="px-3 py-3 text-center text-xl font-black tabular-nums">{reading.diastolic}</td>
                    <td className="px-3 py-3 text-center text-xl font-black tabular-nums text-slate-700">
                      {reading.pulse ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {canEdit ? (
                        <button type="button" onClick={() => remove(reading)} className="text-sm font-bold text-red-700">
                          Quitar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
