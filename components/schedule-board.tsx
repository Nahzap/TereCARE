'use client'

import {
  ArrowCounterClockwise,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Moon,
  PencilSimple,
  Pill,
  Plus,
  Printer,
  Sun,
  SunHorizon,
} from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DoseMark, Slot, WeekPayload } from '@/lib/domain'
import {
  DAY_NAMES,
  DAY_SHORT,
  addDays,
  mondayOf,
  periodOf,
  shortDate,
  sortSlots,
  todayISO,
  type DayPeriod,
} from '@/lib/schedule/dates'
import { api, errorText } from '@/components/api'
import { formatDMY, namesForKind, latestUntilDate, weekRangeLabel } from '@/components/format'
import {
  currentSegment,
  doseState,
  groupHourSegments,
  replacesLookup,
  segmentForDay,
  takenSet,
} from '@/lib/schedule/dose-state'
import { administrationText, durationText, groupMedications } from '@/lib/schedule/medication-list'
import { SlotFormModal } from '@/components/slot-modals'
import { Toast, useToast } from '@/components/use-toast'

type HourScope = 'scheduled' | 'all'
type ViewMode = 'week' | 'day'
type ModalState = { type: 'add'; hour: string } | { type: 'edit'; slot: Slot } | null

type SlotGroup = { key: string; segments: Slot[]; slot: Slot }

type TableRow =
  | { key: string; type: 'banner'; period: DayPeriod }
  | { key: string; type: 'slot'; segments: Slot[]; slot: Slot }
  | { key: string; type: 'empty'; hour: string }

const PERIODS: DayPeriod[] = [periodOf('06:00'), periodOf('12:00'), periodOf('20:00')]

export function ScheduleBoard({
  patientId,
  initialMonday,
}: {
  patientId: string
  initialMonday?: string
}) {
  const router = useRouter()
  const routerRef = useRef(router)
  const { toast, showToast } = useToast()
  const [monday, setMonday] = useState<string | undefined>(initialMonday)
  const mondayRef = useRef(monday)
  const urlLock = useRef<string | null>(null)
  const writtenUrl = useRef<string | undefined>(initialMonday)
  const weekRef = useRef<WeekPayload | null>(null)
  const [week, setWeek] = useState<WeekPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [view, setView] = useState<ViewMode>('week')
  const [hourScope, setHourScope] = useState<HourScope>('scheduled')
  const [includeSos, setIncludeSos] = useState(true)
  const [activeDay, setActiveDay] = useState(0)
  const [modal, setModal] = useState<ModalState>(null)
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set())
  const pendingRef = useRef(pendingKeys)
  const [restoring, setRestoring] = useState(false)
  const [listOpen, setListOpen] = useState(true)

  useEffect(() => {
    routerRef.current = router
  }, [router])

  useEffect(() => {
    mondayRef.current = monday
  }, [monday])

  useEffect(() => {
    pendingRef.current = pendingKeys
  }, [pendingKeys])

  const publishMonday = useCallback((next: string) => {
    const stateChanged = mondayRef.current !== next
    const urlChanged = writtenUrl.current !== next
    if (!stateChanged && !urlChanged) return
    writtenUrl.current = next
    urlLock.current = next
    if (stateChanged) {
      mondayRef.current = next
      setMonday(next)
    }
    if (urlChanged) {
      routerRef.current.replace(`/pacientes/${patientId}?semana=${next}`, { scroll: false })
    }
  }, [patientId])

  useEffect(() => {
    if (urlLock.current && (initialMonday === urlLock.current || initialMonday === undefined)) {
      if (initialMonday === urlLock.current) urlLock.current = null
      return
    }
    urlLock.current = null
    setMonday(initialMonday)
  }, [initialMonday])

  useEffect(() => {
    const requested = monday ? mondayOf(monday) : undefined
    let cancelled = false
    const query = requested ? `?monday=${encodeURIComponent(requested)}` : ''
    api<WeekPayload>(`/api/patients/${patientId}/week${query}`)
      .then((data) => {
        if (cancelled) return
        const mondayChanged = weekRef.current?.monday !== data.monday
        weekRef.current = data
        setWeek(data)
        setBannerError(null)
        if (mondayChanged) {
          const index = data.days.indexOf(todayISO())
          setActiveDay(index >= 0 ? index : 0)
        }
        if (data.monday && data.monday !== monday) publishMonday(data.monday)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        const message = errorText(reason)
        if (message) setBannerError(message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patientId, monday, reloadToken, publishMonday])

  const today = todayISO()
  const doseTaken = week ? takenSet(week.marks) : new Set<string>()
  const doseReplaces = week ? replacesLookup(week.slots) : () => null
  const shown = week
    ? week.slots.filter((slot) =>
        week.days.some((day) => doseState(slot, day, doseTaken, doseReplaces) !== 'hidden'),
      )
    : []
  const currentMeds = week
    ? week.slots.filter((slot) => slot.replacedOn == null || slot.replacedOn > today)
    : []
  const medicines = groupMedications(sortSlots(currentMeds))
  const role = week?.patient.role
  const canEdit = role === 'owner' || role === 'caregiver'
  const canRestore = role === 'owner' && week?.patient.templateKey === 'teresa'
  const labelMonday = (monday ? mondayOf(monday) : undefined) ?? week?.monday
  const stale = Boolean(loading && week && labelMonday && week.monday !== labelMonday)
  const visible = sortSlots(includeSos ? shown : shown.filter((slot) => slot.kind !== 'sos'))
  const hourGroups: SlotGroup[] = groupHourSegments(visible, doseReplaces).map((segments) => ({
    key: segments
      .map((segment) => segment.id)
      .sort()
      .join('|'),
    segments,
    slot: currentSegment(segments, today),
  }))
  const rows = buildRows(hourGroups, hourScope)
  const activeIso = week?.days[activeDay]

  function goWeek(delta: number) {
    const base = mondayRef.current ? mondayOf(mondayRef.current) : weekRef.current?.monday
    if (!base) return
    publishMonday(addDays(base, delta))
  }

  async function removeSlot(slot: Slot) {
    if (!window.confirm(`¿Borrar ${slot.name} de la posología?`)) return
    try {
      await api(`/api/slots/${slot.id}`, { method: 'DELETE' })
      reload('Medicamento borrado')
    } catch (reason) {
      setBannerError(errorText(reason) ?? 'No se pudo borrar el medicamento')
    }
  }

  function reload(message?: string) {
    setModal(null)
    if (message) {
      setBannerError(null)
      showToast(message)
    }
    setReloadToken((value) => value + 1)
  }

  async function toggleDose(slot: Slot, day: string) {
    if (!weekRef.current || !canEdit) return
    const key = `${slot.id}|${day}`
    if (pendingRef.current.has(key)) return
    const previous = isTaken(weekRef.current.marks, slot.id, day)
    const next = !previous
    const nextPending = new Set(pendingRef.current)
    nextPending.add(key)
    pendingRef.current = nextPending
    setPendingKeys(nextPending)
    setWeek((current) => {
      if (!current) return current
      const updated = withTaken(current, slot.id, day, next)
      weekRef.current = updated
      return updated
    })
    try {
      const result = await api<{ taken: boolean }>(`/api/patients/${patientId}/doses`, {
        method: 'PUT',
        body: JSON.stringify({ slotId: slot.id, takenOn: day, taken: next }),
      })
      setWeek((current) => {
        if (!current) return current
        const updated = withTaken(current, slot.id, day, result.taken)
        weekRef.current = updated
        return updated
      })
    } catch (reason) {
      setWeek((current) => {
        if (!current) return current
        const updated = withTaken(current, slot.id, day, previous)
        weekRef.current = updated
        return updated
      })
      const message = errorText(reason)
      if (message) setBannerError(message)
    } finally {
      const cleared = new Set(pendingRef.current)
      cleared.delete(key)
      pendingRef.current = cleared
      setPendingKeys(cleared)
    }
  }

  async function restoreTemplate() {
    if (!window.confirm('Esto vuelve a la receta inicial y borra las marcas de tomado.')) return
    setRestoring(true)
    setBannerError(null)
    try {
      await api(`/api/patients/${patientId}/restore-template`, { method: 'POST' })
      showToast('Receta inicial restaurada')
      setReloadToken((value) => value + 1)
    } catch (reason) {
      const message = errorText(reason)
      if (message) setBannerError(message)
    } finally {
      setRestoring(false)
    }
  }

  const patientName = week?.patient.fullName ?? ''

  return (
    <div>
      {week ? (
        <div className="print-only px-2 pb-3">
          <h1 className="text-xl font-black">MEDICAMENTOS DIARIOS — {patientName.toUpperCase()}</h1>
          <p className="text-sm font-semibold">{weekRangeLabel(week.monday)}</p>
          <p className="text-sm">✓ = Administrado | [ ] = Pendiente</p>
        </div>
      ) : null}

      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1400px] gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:px-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white">
              <Pill size={26} weight="fill" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-[0.14em] text-slate-500 uppercase">
                Esquema semanal y diario por horas
              </p>
              <h1 className="truncate text-2xl font-black tracking-tight uppercase sm:text-3xl">
                {patientName || '…'}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => goWeek(-7)}
              disabled={!labelMonday}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm disabled:opacity-50"
            >
              <CaretLeft size={14} aria-hidden />
              Anterior
            </button>
            <div className="min-w-40 px-2 text-center">
              <p className="text-[10px] font-bold tracking-[0.16em] text-slate-500 uppercase">Semana del esquema</p>
              <p className="text-sm font-black tabular-nums">
                {labelMonday ? weekRangeLabel(labelMonday) : '…'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => goWeek(7)}
              disabled={!labelMonday}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm disabled:opacity-50"
            >
              Siguiente
              <CaretRight size={14} aria-hidden />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {canEdit ? (
              <button
                type="button"
                onClick={() => setModal({ type: 'add', hour: '08:00' })}
                className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
              >
                <Plus size={16} weight="bold" aria-hidden />
                Agregar posología
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!week}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Printer size={16} aria-hidden />
              Imprimir hoja
            </button>
            {canRestore ? (
              <button
                type="button"
                onClick={restoreTemplate}
                disabled={restoring}
                className="inline-flex items-center gap-2 rounded-full bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-800 disabled:opacity-60"
              >
                <ArrowCounterClockwise size={16} aria-hidden />
                Reiniciar
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-3 py-3 sm:px-4">
        {bannerError ? (
          <div role="alert" className="no-print rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <p>{bannerError}</p>
            {!week ? (
              <button
                type="button"
                onClick={() => setReloadToken((value) => value + 1)}
                className="mt-2 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-red-800 ring-1 ring-red-200"
              >
                Reintentar
              </button>
            ) : null}
          </div>
        ) : null}

        {!week && loading ? (
          <p className="no-print text-sm font-medium text-slate-600" role="status">
            Cargando esquema…
          </p>
        ) : null}

        {week ? (
          <>
            <section data-jump="Lista de medicamentos" aria-label="Lista de medicamentos" className="no-print rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <button
                  type="button"
                  aria-expanded={listOpen}
                  aria-controls="medication-list"
                  onClick={() => setListOpen((open) => !open)}
                  className="flex min-w-0 items-center gap-2 text-left"
                >
                  <span>
                    <span className="block font-black">Lista de medicamentos</span>
                    <span className="block text-sm text-slate-600">
                      {medicines.length} medicamentos vigentes. Lo ya tomado sigue en su hora, en la tabla.
                    </span>
                  </span>
                  <CaretDown size={18} className={`shrink-0 text-slate-500 ${listOpen ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setModal({ type: 'add', hour: '08:00' })}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white"
                  >
                    <Plus size={16} weight="bold" aria-hidden />
                    Agregar
                  </button>
                ) : null}
              </div>
              {listOpen ? (
                medicines.length === 0 ? (
                <p className="border-t border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  Todavía no hay medicamentos en esta ficha.
                </p>
              ) : (
                <div id="medication-list" className="border-t border-slate-200">
                  <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-slate-900 text-[11px] font-bold tracking-wide text-white uppercase">
                        <th className="px-2 py-2 whitespace-nowrap">Nombre</th>
                        <th className="px-2 py-2 whitespace-nowrap">mg</th>
                        <th className="px-2 py-2 whitespace-nowrap">N. Comercial</th>
                        <th className="px-2 py-2">Administración y posología</th>
                        <th className="px-2 py-2 whitespace-nowrap">Duración</th>
                        {canEdit ? <th className="w-10 px-2 py-2"><span className="sr-only">Acciones</span></th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {medicines.map((group) => (
                        <tr key={group.key} className="border-t border-slate-200 align-top">
                          <td className="px-2 py-2 font-black text-slate-950">{group.name}</td>
                          <td className="px-2 py-2 font-semibold whitespace-nowrap text-slate-800">{group.dose}</td>
                          <td className="px-2 py-2 whitespace-nowrap text-slate-700">{group.brandName || '—'}</td>
                          <td className="px-2 py-2 whitespace-pre-line text-slate-700">{administrationText(group.doses)}</td>
                          <td className="px-2 py-2 font-semibold whitespace-nowrap text-slate-800">
                            {durationText(group.kind, group.endDate, formatDMY)}
                          </td>
                          {canEdit ? (
                            <td className="px-2 py-2">
                              <details className="relative">
                                <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-center text-sm font-black text-slate-700 [&::-webkit-details-marker]:hidden">
                                  ···
                                </summary>
                                <div className="absolute right-0 z-20 mt-1 grid min-w-36 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                                  {group.doses.map((slot) => (
                                    <div key={slot.id} className="grid">
                                      <button
                                        type="button"
                                        onClick={() => setModal({ type: 'edit', slot })}
                                        className="rounded-lg px-2 py-1 text-left text-sm font-bold text-slate-800 hover:bg-slate-50"
                                      >
                                        {group.doses.length > 1 ? `Editar ${slot.hour}` : 'Editar'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeSlot(slot)}
                                        className="rounded-lg px-2 py-1 text-left text-sm font-bold text-red-700 hover:bg-red-50"
                                      >
                                        {group.doses.length > 1 ? `Borrar ${slot.hour}` : 'Borrar'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )
              ) : null}
            </section>
            <div className="no-print flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div role="group" aria-label="Vista del esquema" className="flex flex-col gap-1 rounded-2xl bg-white p-1 shadow-sm sm:flex-row">
                <button
                  type="button"
                  aria-pressed={view === 'week'}
                  onClick={() => setView('week')}
                  className={`rounded-xl px-3 py-2 text-left text-sm font-bold ${
                    view === 'week' ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  1. Tabla semanal completa (Lun a Dom)
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'day'}
                  onClick={() => setView('day')}
                  className={`rounded-xl px-3 py-2 text-left text-sm font-bold ${
                    view === 'day' ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  2. Ver solo 1 día en grande
                </button>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label htmlFor="hour-scope" className="text-sm font-bold text-slate-700">
                  Horas
                </label>
                <select
                  id="hour-scope"
                  value={hourScope}
                  onChange={(event) => setHourScope(event.target.value === 'all' ? 'all' : 'scheduled')}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                >
                  <option value="scheduled">Solo horas con medicamentos</option>
                  <option value="all">Todas las horas del día, 06:00 a 23:00</option>
                </select>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={includeSos}
                    onChange={(event) => setIncludeSos(event.target.checked)}
                    className="h-4 w-4 accent-blue-700"
                  />
                  Incluir tomas SOS
                </label>
              </div>
            </div>

            <Legend slots={shown} />

            <div className={view === 'day' ? 'hidden print:block' : undefined}>
              <div data-jump="Tabla semanal" className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm ${stale ? 'opacity-60' : ''}`}>
                <table className="w-full min-w-[1060px] border-collapse text-left">
                  <caption className="sr-only">Esquema semanal de {patientName}</caption>
                  <thead>
                    <tr className="text-white">
                      <th scope="col" className="bg-slate-900 px-3 py-3 align-bottom">
                        <div className="text-[10px] font-bold tracking-[0.14em] text-white/60 uppercase">Horario</div>
                        <div className="text-sm font-black uppercase">Hora</div>
                      </th>
                      <th scope="col" className="bg-slate-900 px-3 py-3 align-bottom">
                        <div className="text-[10px] font-bold tracking-[0.14em] text-white/60 uppercase">
                          Receta {patientName}
                        </div>
                        <div className="text-sm font-black uppercase">Medicamento y dosis</div>
                      </th>
                      {week.days.map((day, index) => {
                        const progress = fixedProgress(week.slots, week.marks, day)
                        const active = index === activeDay
                        const complete = progress.total > 0 && progress.done === progress.total
                        return (
                          <th key={day} scope="col" className={`p-0 align-bottom ${active ? 'bg-blue-700' : 'bg-slate-900'}`}>
                            <button
                              type="button"
                              aria-pressed={active}
                              onClick={() => setActiveDay(index)}
                              className="flex w-full flex-col items-center gap-0.5 px-2 py-3 text-white"
                            >
                              {active ? (
                                <span className="rounded bg-amber-300 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-slate-900 uppercase">
                                  Día guía
                                </span>
                              ) : (
                                <span className="h-[18px]" />
                              )}
                              <span className="text-sm font-black">{DAY_NAMES[index] ?? ''}</span>
                              <span className="text-xs font-semibold text-white/80">{shortDate(day)}</span>
                              <span
                                className={`mt-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                  complete ? 'bg-emerald-500 text-white' : 'bg-white/15 text-white'
                                }`}
                              >
                                {progress.done}/{progress.total} fijos
                              </span>
                            </button>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={week.days.length + 2} className="px-4 py-10 text-center text-sm text-slate-500">
                          No hay medicamentos en esta semana.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => {
                        if (row.type === 'banner') {
                          return (
                            <tr key={row.key}>
                              <td
                                colSpan={week.days.length + 2}
                                data-jump={row.period.short}
                                className={`px-4 py-2 text-sm font-black tracking-wide uppercase ${periodClass(row.period.id)}`}
                              >
                                <span className="inline-flex items-center gap-2">
                                  <PeriodIcon name={row.period.iconName} />
                                  {row.period.title}
                                </span>
                              </td>
                            </tr>
                          )
                        }
                        if (row.type === 'empty') {
                          return (
                            <tr key={row.key} className="group">
                              <HourCell hour={row.hour} />
                              <td className="border-t border-slate-200 px-3 py-3 group-hover:bg-slate-50">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
                                  <span>— Sin medicamentos a las {row.hour} —</span>
                                  {canEdit ? (
                                    <button
                                      type="button"
                                      onClick={() => setModal({ type: 'add', hour: row.hour })}
                                      className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline"
                                    >
                                      <Plus size={14} aria-hidden />
                                      Asignar aquí
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                              {week.days.map((day, index) => (
                                <td
                                  key={day}
                                  className={`border-t border-slate-200 text-center text-slate-300 ${
                                    index === activeDay ? 'active-day-col' : 'group-hover:bg-slate-50'
                                  }`}
                                >
                                  —
                                </td>
                              ))}
                            </tr>
                          )
                        }
                        const slot = row.slot
                        return (
                          <tr key={row.key} className="group">
                            <HourCell hour={slot.hour} />
                            <td className="relative border-t border-slate-200 px-3 py-3 align-middle group-hover:bg-slate-50">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-base font-black break-words text-slate-950">{slot.name}</span>
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                                  {slot.dose}
                                </span>
                                {slot.brandName ? (
                                  <span className="text-sm font-semibold text-slate-600">{slot.brandName}</span>
                                ) : null}
                              </div>
                              <div className="mt-1">
                                <KindBadge slot={slot} />
                              </div>
                              {slot.note ? <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{slot.note}</p> : null}
                              {canEdit ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setModal({ type: 'edit', slot })}
                                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                                  >
                                    <PencilSimple size={14} aria-hidden />
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeSlot(slot)}
                                    className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700"
                                  >
                                    Borrar
                                  </button>
                                </div>
                              ) : null}
                            </td>
                            {week.days.map((day, index) => {
                              const owner = segmentForDay(row.segments, day, doseTaken, doseReplaces)
                              const state = owner ? doseState(owner, day, doseTaken, doseReplaces) : 'hidden'
                              return (
                                <td
                                  key={day}
                                  className={`border-t border-slate-200 px-1.5 py-2 align-middle ${
                                    index === activeDay ? 'active-day-col' : 'group-hover:bg-slate-50'
                                  }`}
                                >
                                  <DoseButton
                                    slot={owner ?? slot}
                                    dayIndex={index}
                                    state={state}
                                    disabled={!canEdit || !owner || pendingKeys.has(`${owner.id}|${day}`)}
                                    onToggle={() => {
                                      if (owner) toggleDose(owner, day)
                                    }}
                                  />
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {view === 'week' ? (
                <p className="no-print mt-3 text-sm text-slate-500">
                  Haz clic en el encabezado de un día para iluminar la columna. Al editar la hora, los tomados se quedan y solo se mueven los DAR pendientes.
                </p>
              ) : null}
            </div>

            {view === 'day' && activeIso ? (
              <DailyView
                week={week}
                dayIndex={activeDay}
                day={activeIso}
                slots={visible}
                canEdit={canEdit}
                pendingKeys={pendingKeys}
                onSelectDay={setActiveDay}
                onToggle={toggleDose}
                onEdit={(slot) => setModal({ type: 'edit', slot })}
                onDelete={removeSlot}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {modal?.type === 'add' || modal?.type === 'edit' ? (
        <SlotFormModal
          patientId={patientId}
          slot={modal.type === 'edit' ? modal.slot : null}
          initialHour={modal.type === 'add' ? modal.hour : modal.slot.hour}
          takenToday={modal.type === 'edit' && isTaken(week?.marks ?? [], modal.slot.id, today)}
          onClose={() => setModal(null)}
          onSaved={reload}
        />
      ) : null}
      <Toast message={toast} />
    </div>
  )
}

function DailyView({
  week,
  dayIndex,
  day,
  slots,
  canEdit,
  pendingKeys,
  onSelectDay,
  onToggle,
  onEdit,
  onDelete,
}: {
  week: WeekPayload
  dayIndex: number
  day: string
  slots: Slot[]
  canEdit: boolean
  pendingKeys: Set<string>
  onSelectDay: (index: number) => void
  onToggle: (slot: Slot, day: string) => void
  onEdit: (slot: Slot) => void
  onDelete: (slot: Slot) => void
}) {
  const progress = fixedProgress(week.slots, week.marks, day)
  const dayTaken = takenSet(week.marks)
  const dayReplaces = replacesLookup(week.slots)
  const timeline = slots.filter((slot) => {
    const state = doseState(slot, day, dayTaken, dayReplaces)
    return state === 'pending' || state === 'taken'
  })

  return (
    <section data-jump="Día" className="no-print flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {week.days.map((iso, index) => {
          const stats = fixedProgress(week.slots, week.marks, iso)
          const active = index === dayIndex
          const complete = stats.total > 0 && stats.done === stats.total
          return (
            <button
              key={iso}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectDay(index)}
              className={`rounded-2xl border px-2 py-3 text-center ${
                active ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              <div className="text-xs font-bold">{DAY_SHORT[index] ?? ''}</div>
              <div className="text-sm font-black">{shortDate(iso)}</div>
              <div className={`mt-1 text-[11px] font-bold ${complete && !active ? 'text-emerald-700' : ''}`}>
                {stats.done}/{stats.total} fijos
              </div>
            </button>
          )
        })}
      </div>
      <div className="rounded-2xl bg-slate-900 px-4 py-4 text-white">
        <h2 className="text-xl font-black">
          {DAY_NAMES[dayIndex] ?? ''} · {shortDate(day)}
        </h2>
        <p className="text-sm text-slate-300">
          {progress.done} de {progress.total} fijos tomados
        </p>
      </div>
      {timeline.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No hay medicamentos visibles este día.
        </p>
      ) : (
        <ul className="grid gap-3">
          {timeline.map((slot) => {
            const period = periodOf(slot.hour)
            const taken = doseState(slot, day, dayTaken, dayReplaces) === 'taken'
            return (
              <li
                key={slot.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-16 w-20 shrink-0 items-center justify-center rounded-2xl text-lg font-black tabular-nums ${hourTone(period.id)}`}
                  >
                    {slot.hour}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-black">{slot.name}</span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">{slot.dose}</span>
                      {slot.brandName ? <span className="text-sm font-semibold text-slate-600">{slot.brandName}</span> : null}
                    </div>
                    <div className="mt-1">
                      <KindBadge slot={slot} />
                    </div>
                    {slot.note ? <p className="mt-1 text-sm text-slate-500">{slot.note}</p> : null}
                    {canEdit ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(slot)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600"
                        >
                          <PencilSimple size={14} aria-hidden />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(slot)}
                          className="inline-flex items-center gap-1 rounded-full border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
                        >
                          Borrar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!canEdit || pendingKeys.has(`${slot.id}|${day}`)}
                  aria-pressed={taken}
                  onClick={() => onToggle(slot, day)}
                  className={`min-w-40 rounded-2xl px-4 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-70 ${
                    taken ? 'bg-emerald-600 text-white' : 'bg-white text-slate-900 ring-1 ring-slate-300'
                  }`}
                >
                  {taken ? 'TOMADO' : 'MARCAR TOMADO'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Legend({ slots }: { slots: Slot[] }) {
  const fixed = namesForKind(slots, 'fixed')
  const until = namesForKind(slots, 'until')
  const sos = namesForKind(slots, 'sos')
  const untilDate = latestUntilDate(slots)
  const cards = [
    fixed.length > 0
      ? {
          key: 'fixed',
          title: 'Permanentes',
          body: fixed.join(', '),
          box: 'border-emerald-200 bg-emerald-50 text-emerald-950',
          kicker: 'text-emerald-700',
        }
      : null,
    until.length > 0
      ? {
          key: 'until',
          title: 'Hasta una fecha',
          body: `${until.join(', ')}${untilDate ? ` · hasta ${formatDMY(untilDate)}` : ''}`,
          box: 'border-amber-200 bg-amber-50 text-amber-950',
          kicker: 'text-amber-800',
        }
      : null,
    sos.length > 0
      ? {
          key: 'sos',
          title: 'Solo si hay dolor (SOS)',
          body: sos.join(', '),
          box: 'border-purple-200 bg-purple-50 text-purple-950',
          kicker: 'text-purple-700',
        }
      : null,
  ].filter((card) => card !== null)

  if (cards.length === 0) return null
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((card) => (
        <article key={card.key} className={`rounded-2xl border p-4 ${card.box}`}>
          <h2 className={`text-xs font-black tracking-wide uppercase ${card.kicker}`}>{card.title}</h2>
          <p className="mt-1 text-sm font-semibold">{card.body}</p>
        </article>
      ))}
    </div>
  )
}

function KindBadge({ slot }: { slot: Slot }) {
  if (slot.kind === 'fixed') {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black tracking-wide text-emerald-800">
        PERMANENTE
      </span>
    )
  }
  if (slot.kind === 'until') {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black tracking-wide text-amber-800">
        HASTA {slot.endDate ? formatDMY(slot.endDate) : '—'}
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full border border-dashed border-purple-400 bg-purple-50 px-2 py-0.5 text-[11px] font-black tracking-wide text-purple-700">
      SOLO SI HAY DOLOR (SOS)
    </span>
  )
}

function DoseButton({
  slot,
  dayIndex,
  state,
  disabled,
  onToggle,
}: {
  slot: Slot
  dayIndex: number
  state: ReturnType<typeof doseState>
  disabled: boolean
  onToggle: () => void
}) {
  if (state === 'hidden') {
    return (
      <div className="mx-auto py-2 text-center text-xs font-semibold text-slate-300" aria-label="Sin dosis en esta hora">
        —
      </div>
    )
  }
  if (state === 'ended') {
    return (
      <div className="mx-auto w-full max-w-[104px] rounded-xl bg-slate-100 px-1 py-2 text-center text-[11px] font-semibold text-slate-500">
        <div className="font-black uppercase">Terminó</div>
        {slot.endDate ? <div>{formatDMY(slot.endDate)}</div> : null}
      </div>
    )
  }
  const taken = state === 'taken'
  const sos = slot.kind === 'sos'
  const label = taken ? 'TOMADO' : sos ? 'SOS' : 'DAR'
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={taken}
      aria-label={`${taken ? 'Quitar tomado' : 'Marcar tomado'}: ${slot.name}, ${DAY_NAMES[dayIndex] ?? ''} ${slot.hour}`}
      onClick={onToggle}
      className={`mx-auto flex w-full max-w-[104px] flex-col items-center rounded-xl border px-1 py-2 text-center disabled:cursor-not-allowed disabled:opacity-70 ${
        taken
          ? 'border-emerald-600 bg-emerald-600 text-white'
          : sos
            ? 'border-dashed border-purple-400 bg-white text-purple-700'
            : 'border-slate-300 bg-white text-slate-800'
      }`}
    >
      <span
        className={`mb-1 flex h-4 w-4 items-center justify-center rounded border ${
          taken ? 'border-white bg-white text-emerald-600' : 'border-current bg-white'
        }`}
        aria-hidden
      >
        {taken ? <Check size={12} weight="bold" /> : null}
      </span>
      <span className="text-[11px] font-black tracking-wide">{label}</span>
      <span className="text-[10px] font-semibold opacity-80">
        {DAY_SHORT[dayIndex] ?? ''} {slot.hour}
      </span>
    </button>
  )
}

function HourCell({ hour }: { hour: string }) {
  return (
    <td className="border-t border-slate-200 px-3 py-3 align-middle group-hover:bg-slate-50">
      <div className="text-3xl font-black tracking-tight tabular-nums sm:text-4xl">{hour}</div>
    </td>
  )
}

function PeriodIcon({ name }: { name: DayPeriod['iconName'] }) {
  const Icon = name === 'SunHorizon' ? SunHorizon : name === 'Sun' ? Sun : Moon
  return <Icon size={18} weight="fill" aria-hidden />
}

function periodClass(id: DayPeriod['id']) {
  if (id === 'morning') return 'bg-amber-100 text-amber-950'
  if (id === 'afternoon') return 'bg-sky-100 text-sky-950'
  return 'bg-indigo-100 text-indigo-950'
}

function hourTone(id: DayPeriod['id']) {
  if (id === 'morning') return 'bg-amber-400 text-amber-950'
  if (id === 'afternoon') return 'bg-sky-500 text-white'
  return 'bg-indigo-600 text-white'
}

function fixedProgress(slots: readonly Slot[], marks: readonly DoseMark[], day: string) {
  const taken = takenSet(marks)
  const replacesOf = replacesLookup(slots)
  let total = 0
  let done = 0
  for (const slot of slots) {
    if (slot.kind === 'sos') continue
    const state = doseState(slot, day, taken, replacesOf)
    if (state !== 'pending' && state !== 'taken') continue
    total += 1
    if (state === 'taken') done += 1
  }
  return { done, total }
}

function isTaken(marks: readonly DoseMark[], slotId: string, day: string) {
  return marks.some((mark) => mark.slotId === slotId && mark.takenOn === day)
}

function withTaken(week: WeekPayload, slotId: string, takenOn: string, taken: boolean): WeekPayload {
  const marks = week.marks.filter((mark) => !(mark.slotId === slotId && mark.takenOn === takenOn))
  if (taken) marks.push({ slotId, takenOn, markedByName: null })
  return { ...week, marks }
}

function buildRows(groups: readonly SlotGroup[], hourScope: HourScope): TableRow[] {
  const sorted = [...groups].sort((a, b) => a.slot.hour.localeCompare(b.slot.hour) || a.slot.name.localeCompare(b.slot.name, 'es'))
  const rows: TableRow[] = []
  for (const period of PERIODS) {
    const periodGroups = sorted.filter((group) => periodOf(group.slot.hour).id === period.id)
    const body: TableRow[] = []
    if (hourScope === 'scheduled') {
      for (const group of periodGroups) body.push({ key: group.key, type: 'slot', segments: group.segments, slot: group.slot })
    } else {
      const start = period.id === 'morning' ? 6 : period.id === 'afternoon' ? 12 : 20
      const end = period.id === 'morning' ? 11 : period.id === 'afternoon' ? 19 : 23
      const hours = new Set<string>()
      for (let hour = start; hour <= end; hour += 1) hours.add(`${String(hour).padStart(2, '0')}:00`)
      for (const group of periodGroups) hours.add(group.slot.hour)
      for (const hour of [...hours].sort()) {
        const atHour = periodGroups.filter((group) => group.slot.hour === hour)
        if (atHour.length === 0) body.push({ key: `empty-${hour}`, type: 'empty', hour })
        else for (const group of atHour) body.push({ key: group.key, type: 'slot', segments: group.segments, slot: group.slot })
      }
    }
    if (body.length === 0) continue
    rows.push({ key: period.id, type: 'banner', period }, ...body)
  }
  return rows
}
