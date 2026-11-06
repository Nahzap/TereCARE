'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Eraser } from '@phosphor-icons/react'
import type { Me } from '@/lib/domain'
import { dayCare, hasCareRules, type CareDayKind, type CareSituation } from '@/lib/care/situation'
import { api, errorText } from '@/components/api'
import { Toast, useToast } from '@/components/use-toast'
import { addDays, MONTHS, shortDate } from '@/lib/schedule/dates'
import {
  applyChanges,
  canEditCarePerson,
  caregiverColor,
  clampWindowStart,
  COVERAGE_FUTURE_DAYS,
  COVERAGE_RADIUS_DAYS,
  COVERAGE_WEEK_DAYS,
  coverageDiff,
  coverageSummary,
  coverageView,
  coveredHourCount,
  daysBetween,
  formatHours,
  formatRange,
  historyBounds,
  HOURS_IN_DAY,
  insideRect,
  joinNames,
  monthOverlapsHistory,
  percentOf,
  rectBetween,
  rectChanges,
  shiftCoverageStart,
  shortNames,
  slotsInRect,
  TOTAL_SCOPES,
  totalsLabel,
  totalsRange,
  weekdayShort,
  weekdayTitle,
  type CoverageBrush,
  type CoveragePayload,
  type CoverageSlot,
  type CoverageTotals,
  type HourRect,
  type HourSlot,
  type TotalScope,
} from '@/lib/coverage/schedule'
import {
  applyLunchChanges,
  LUNCH_PEOPLE_MAX,
  lunchBrushChanges,
  lunchDiff,
  type LunchBrush,
  type LunchSlot,
} from '@/lib/lunch/lunch'

type Painter = {
  personId: string
  userId: string | null
  name: string
  color: string
  assignable: boolean
}

type Gesture = CoverageBrush & {
  start: HourSlot
  end: HourSlot
}

type LunchGesture = LunchBrush & {
  start: string
  end: string
}

const ERASER = 'eraser'
const LUNCH_AFTER_HOUR = 13

type HoverCell = {
  coveredOn: string
  hour: number
}

type HoverLunch = {
  lunchOn: string
}

const HOURS = Array.from({ length: HOURS_IN_DAY }, (_, hour) => hour)

function pausedTitle(kind: CareDayKind) {
  return kind === 'hospital'
    ? 'Hospitalizada. Este día no entra en el indicador.'
    : 'Antes del alta. Este día no entra en el indicador.'
}

function fractionClass(covered: number, isToday: boolean) {
  if (isToday) return covered === 24 ? 'mt-px text-[8px] leading-none text-emerald-200' : 'mt-px text-[8px] leading-none text-amber-200'
  return covered === 24 ? 'mt-px text-[8px] leading-none text-emerald-700' : 'mt-px text-[8px] leading-none text-rose-600'
}

const NAV_BUTTON =
  'rounded-md px-2 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'

function cellLabel(day: string, hour: number, names: readonly string[]) {
  return `${weekdayTitle(day)} ${shortDate(day)}, ${formatRange({ start: hour, end: hour + 1 })}. ${joinNames(names)}.`
}

function peopleOnCell(slots: readonly CoverageSlot[], painters: readonly Painter[]) {
  const order = new Map(painters.map((painter, index) => [painter.personId, index]))
  const color = new Map(painters.map((painter) => [painter.personId, painter.color]))
  return [...slots]
    .map((slot) => ({
      personId: slot.personId,
      name: slot.caregiverName,
      color: color.get(slot.personId) ?? '#64748b',
    }))
    .sort((left, right) => (order.get(left.personId) ?? 99) - (order.get(right.personId) ?? 99))
}

export function CoverageBoard({
  patientId,
  peopleRevision = 0,
  careRevision = 0,
}: {
  patientId: string
  peopleRevision?: number
  careRevision?: number
}) {
  const { toast, showToast } = useToast()
  const [data, setData] = useState<CoveragePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [meId, setMeId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hover, setHover] = useState<HoverCell | null>(null)
  const [anchor, setAnchor] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [scope, setScope] = useState<TotalScope>('month')
  const [totals, setTotals] = useState<CoverageTotals | null>(null)
  const [totalsError, setTotalsError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [savedSlots, setSavedSlots] = useState<CoverageSlot[] | null>(null)
  const [savedLunches, setSavedLunches] = useState<LunchSlot[] | null>(null)
  const [situation, setSituation] = useState<CareSituation | null>(null)

  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [lunchGesture, setLunchGesture] = useState<LunchGesture | null>(null)
  const [hoverLunch, setHoverLunch] = useState<HoverLunch | null>(null)

  const gestureRef = useRef<Gesture | null>(null)
  const lunchGestureRef = useRef<LunchGesture | null>(null)
  const slotsRef = useRef<CoverageSlot[]>([])
  const lunchesRef = useRef<LunchSlot[]>([])
  const savedRef = useRef<CoverageSlot[]>([])
  const savedLunchesRef = useRef<LunchSlot[]>([])
  const dirtyRef = useRef(false)
  const dataRef = useRef<CoveragePayload | null>(null)
  const savingRef = useRef(false)
  const commitRef = useRef<(done: Gesture) => void>(() => {})
  const commitLunchRef = useRef<(done: LunchGesture) => void>(() => {})
  const editorRef = useRef({
    canEdit: false,
    personId: null as string | null,
    erasing: false,
    assignable: new Set<string>(),
    selfOnly: false,
    myPersonId: null as string | null,
  })
  const dragRef = useRef<number | null>(null)
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (slideTimer.current) clearTimeout(slideTimer.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api<Me>('/api/me')
      .then((me) => {
        if (!cancelled) setMeId(me.id)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const query = anchor ? `?from=${anchor}` : ''
    api<CoveragePayload>(`/api/patients/${patientId}/coverage${query}`)
      .then((payload) => {
        if (cancelled) return
        setError(null)
        const lunches = payload.lunches ?? []
        if (dirtyRef.current && dataRef.current?.from === payload.from) {
          setData({ ...payload, slots: slotsRef.current, lunches: lunchesRef.current })
          return
        }
        savedRef.current = payload.slots
        slotsRef.current = payload.slots
        savedLunchesRef.current = lunches
        lunchesRef.current = lunches
        dirtyRef.current = false
        setSavedSlots(payload.slots)
        setSavedLunches(lunches)
        setData({ ...payload, lunches })
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason) ?? 'No se pudo cargar el horario')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [patientId, reloadToken, anchor, peopleRevision])

  const windowFrom = data?.from ?? null

  useEffect(() => {
    if (!windowFrom) return
    let cancelled = false
    api<CoverageTotals>(`/api/patients/${patientId}/coverage/totals?scope=${scope}&from=${windowFrom}`)
      .then((payload) => {
        if (cancelled) return
        setTotals(payload)
        setTotalsError(null)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setTotalsError(errorText(reason) ?? 'No se pudieron sumar las horas')
      })
    return () => {
      cancelled = true
    }
  }, [patientId, scope, windowFrom, revision, reloadToken, peopleRevision, careRevision])

  useEffect(() => {
    let cancelled = false
    api<CareSituation>(`/api/patients/${patientId}/care-situation`)
      .then((payload) => {
        if (!cancelled) setSituation(payload)
      })
      .catch(() => {
        if (!cancelled) setSituation(null)
      })
    return () => {
      cancelled = true
    }
  }, [patientId, careRevision])

  const namedSlots = useMemo(() => data?.slots ?? [], [data])
  const namedLunches = useMemo(() => data?.lunches ?? [], [data])

  const painters = useMemo(() => {
    const people = data?.people ?? []
    const withHours = new Set(namedSlots.map((slot) => slot.personId))
    const withLunch = new Set(namedLunches.map((slot) => slot.personId))
    return people
      .map((person, index) => ({
        personId: person.id,
        userId: person.userId,
        name: person.name,
        assignable: person.assignable,
        color: caregiverColor(index),
      }))
      .filter((painter) => painter.assignable || withHours.has(painter.personId) || withLunch.has(painter.personId))
  }, [data, namedSlots, namedLunches])

  const byCell = useMemo(() => {
    const map = new Map<string, CoverageSlot[]>()
    for (const slot of namedSlots) {
      const key = `${slot.coveredOn}|${slot.hour}`
      const list = map.get(key) ?? []
      list.push(slot)
      map.set(key, list)
    }
    return map
  }, [namedSlots])

  const byLunchDay = useMemo(() => {
    const map = new Map<string, LunchSlot[]>()
    for (const slot of namedLunches) {
      const list = map.get(slot.lunchOn) ?? []
      list.push(slot)
      map.set(slot.lunchOn, list)
    }
    return map
  }, [namedLunches])

  const canEdit = data?.role === 'owner' || data?.role === 'caregiver'
  const selfOnly = data?.role === 'caregiver'
  const myPersonId =
    painters.find((painter) => painter.userId != null && painter.userId === meId)?.personId ?? null
  const erasing = selectedId === ERASER
  const preferredId = selfOnly
    ? myPersonId
    : selectedId && selectedId !== ERASER && painters.some((painter) => painter.personId === selectedId)
      ? selectedId
      : (painters.find((painter) => painter.assignable && painter.userId === meId)?.personId ??
        painters.find((painter) => painter.assignable)?.personId ??
        null)
  const activeId = erasing ? (selfOnly ? myPersonId : null) : preferredId
  const selected = painters.find((painter) => painter.personId === preferredId) ?? null
  const canPaintSelf = !selfOnly || myPersonId != null
  const chipNames = shortNames(painters.map((painter) => painter.name))
  const dirty =
    (savedSlots != null && coverageDiff(savedSlots, namedSlots).length > 0) ||
    (savedLunches != null && lunchDiff(savedLunches, namedLunches).length > 0)
  const homeDays = (data?.days ?? []).filter((day) => dayCare(situation, day) === 'home')
  const totalHours = homeDays.length * HOURS_IN_DAY
  const covered = coveredHourCount(namedSlots, homeDays)
  const careByDay = useMemo(() => {
    const map: Record<string, CareDayKind> = {}
    for (const day of data?.days ?? []) map[day] = dayCare(situation, day)
    return map
  }, [data?.days, situation])
  const rect = gesture ? rectBetween(gesture.start, gesture.end) : null
  const rectSize = rect && data ? slotsInRect(data.days, rect).length : 0
  const lunchSpan = lunchGesture
    ? {
        from: lunchGesture.start <= lunchGesture.end ? lunchGesture.start : lunchGesture.end,
        to: lunchGesture.start <= lunchGesture.end ? lunchGesture.end : lunchGesture.start,
      }
    : null
  const lunchSpanDays =
    lunchSpan && data ? data.days.filter((day) => day >= lunchSpan.from && day <= lunchSpan.to) : []

  useEffect(() => {
    dataRef.current = data
    slotsRef.current = data?.slots ?? []
    lunchesRef.current = data?.lunches ?? []
    dirtyRef.current = dirty
    editorRef.current = {
      canEdit: canEdit && canPaintSelf,
      personId: preferredId,
      erasing,
      assignable: new Set(
        painters
          .filter((painter) => {
            if (!painter.assignable) return false
            if (!selfOnly || meId == null) return true
            return canEditCarePerson('caregiver', meId, painter)
          })
          .map((painter) => painter.personId),
      ),
      selfOnly,
      myPersonId,
    }

    commitRef.current = (done) => {
      if (!data || savingRef.current) return
      const cells = slotsInRect(data.days, rectBetween(done.start, done.end))
      const changes = rectChanges(slotsRef.current, cells, done)
      if (changes.length === 0) return
      const names = new Map(painters.map((painter) => [painter.personId, painter.name]))
      const next = applyChanges(slotsRef.current, changes, names)
      slotsRef.current = next
      dirtyRef.current =
        coverageDiff(savedRef.current, next).length > 0 ||
        lunchDiff(savedLunchesRef.current, lunchesRef.current).length > 0
      setError(null)
      setData((current) => (current ? { ...current, slots: next } : current))
    }

    commitLunchRef.current = (done) => {
      if (!data || savingRef.current) return
      const from = done.start <= done.end ? done.start : done.end
      const to = done.start <= done.end ? done.end : done.start
      const days = data.days.filter((day) => day >= from && day <= to)
      const { changes, skippedFull } = lunchBrushChanges(lunchesRef.current, days, done)
      if (skippedFull) {
        showToast(`Como máximo ${LUNCH_PEOPLE_MAX} personas a cargo del almuerzo ese día`)
      }
      if (changes.length === 0) return
      const names = new Map(painters.map((painter) => [painter.personId, painter.name]))
      const next = applyLunchChanges(lunchesRef.current, changes, names)
      lunchesRef.current = next
      dirtyRef.current =
        coverageDiff(savedRef.current, slotsRef.current).length > 0 ||
        lunchDiff(savedLunchesRef.current, next).length > 0
      setError(null)
      setData((current) => (current ? { ...current, lunches: next } : current))
    }
  })

  useEffect(() => {
    if (!dirty) return
    function onLeave(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return
      const link = event.target.closest('a')
      const href = link?.getAttribute('href')
      if (!link || !href || href.startsWith('#')) return
      if (window.confirm('Hay cambios del horario sin guardar. ¿Salir sin guardar?')) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('beforeunload', onLeave)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty])

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (event.buttons === 0) {
        onUp()
        return
      }
      const target = document.elementFromPoint(event.clientX, event.clientY)
      const lunchCurrent = lunchGestureRef.current
      if (lunchCurrent) {
        const lunchCell = target instanceof Element ? target.closest('[data-lunch-cell]') : null
        if (!(lunchCell instanceof HTMLElement)) return
        const lunchOn = lunchCell.dataset.date
        if (!lunchOn || lunchCurrent.end === lunchOn) return
        const next = { ...lunchCurrent, end: lunchOn }
        lunchGestureRef.current = next
        setLunchGesture(next)
        setHoverLunch({ lunchOn })
        return
      }
      const current = gestureRef.current
      if (!current) return
      const cell = target instanceof Element ? target.closest('[data-coverage-cell]') : null
      if (!(cell instanceof HTMLElement)) return
      const coveredOn = cell.dataset.date
      const hour = Number(cell.dataset.hour)
      if (!coveredOn || !Number.isInteger(hour)) return
      if (current.end.coveredOn === coveredOn && current.end.hour === hour) return
      const next = { ...current, end: { coveredOn, hour } }
      gestureRef.current = next
      setGesture(next)
      setHover({ coveredOn, hour })
    }

    function onUp() {
      const lunchDone = lunchGestureRef.current
      if (lunchDone) {
        lunchGestureRef.current = null
        setLunchGesture(null)
        commitLunchRef.current(lunchDone)
        return
      }
      const done = gestureRef.current
      if (!done) return
      gestureRef.current = null
      setGesture(null)
      commitRef.current(done)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onUp)
    }
  }, [])

  function startGesture(cell: HourSlot): Gesture | null {
    const previousLunch = lunchGestureRef.current
    if (previousLunch) {
      lunchGestureRef.current = null
      setLunchGesture(null)
      commitLunchRef.current(previousLunch)
    }
    const previous = gestureRef.current
    if (previous) {
      gestureRef.current = null
      commitRef.current(previous)
    }
    const editor = editorRef.current
    if (!editor.canEdit || savingRef.current) return null
    if (editor.erasing) {
      if (editor.selfOnly) {
        if (!editor.myPersonId) {
          showToast('Tu cuenta no está vinculada a una persona de cuidado')
          return null
        }
        return { personId: editor.myPersonId, mode: 'erase', start: cell, end: cell }
      }
      return { personId: null, mode: 'erase', start: cell, end: cell }
    }
    const personId = editor.selfOnly ? editor.myPersonId : editor.personId
    if (!personId) {
      showToast(editor.selfOnly ? 'Tu cuenta no está vinculada a una persona de cuidado' : 'Elige un cuidador')
      return null
    }
    const holds = slotsRef.current.some(
      (slot) => slot.personId === personId && slot.coveredOn === cell.coveredOn && slot.hour === cell.hour,
    )
    if (!holds && !editor.assignable.has(personId)) {
      showToast('Esa persona ya no es cuidadora. Solo puedes quitar sus horas.')
      return null
    }
    return { personId, mode: holds ? 'erase' : 'paint', start: cell, end: cell }
  }

  function startLunchGesture(lunchOn: string): LunchGesture | null {
    const previous = gestureRef.current
    if (previous) {
      gestureRef.current = null
      setGesture(null)
      commitRef.current(previous)
    }
    const previousLunch = lunchGestureRef.current
    if (previousLunch) {
      lunchGestureRef.current = null
      commitLunchRef.current(previousLunch)
    }
    const editor = editorRef.current
    if (!editor.canEdit || savingRef.current) return null
    if (editor.erasing) {
      if (editor.selfOnly) {
        if (!editor.myPersonId) {
          showToast('Tu cuenta no está vinculada a una persona de cuidado')
          return null
        }
        return { personId: editor.myPersonId, mode: 'erase', start: lunchOn, end: lunchOn }
      }
      return { personId: null, mode: 'erase', start: lunchOn, end: lunchOn }
    }
    const personId = editor.selfOnly ? editor.myPersonId : editor.personId
    if (!personId) {
      showToast(editor.selfOnly ? 'Tu cuenta no está vinculada a una persona de cuidado' : 'Elige un cuidador')
      return null
    }
    const holds = lunchesRef.current.some((slot) => slot.personId === personId && slot.lunchOn === lunchOn)
    if (!holds && !editor.assignable.has(personId)) {
      showToast('Esa persona ya no es cuidadora. Solo puedes quitar su almuerzo.')
      return null
    }
    return { personId, mode: holds ? 'erase' : 'paint', start: lunchOn, end: lunchOn }
  }

  function cellOf(element: HTMLElement): HourSlot | null {
    const coveredOn = element.dataset.date
    const hour = Number(element.dataset.hour)
    return coveredOn && Number.isInteger(hour) ? { coveredOn, hour } : null
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const cell = cellOf(event.currentTarget)
    if (!cell) return
    const next = startGesture(cell)
    gestureRef.current = next
    setGesture(next)
  }

  function onLunchPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const lunchOn = event.currentTarget.dataset.date
    if (!lunchOn) return
    const next = startLunchGesture(lunchOn)
    lunchGestureRef.current = next
    setLunchGesture(next)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    const cell = cellOf(event.currentTarget)
    if (!cell) return
    const next = startGesture(cell)
    if (next) commitRef.current(next)
  }

  function onLunchKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    const lunchOn = event.currentTarget.dataset.date
    if (!lunchOn) return
    const next = startLunchGesture(lunchOn)
    if (next) commitLunchRef.current(next)
  }

  const hoverPeople = hover ? (byCell.get(`${hover.coveredOn}|${hover.hour}`) ?? []) : []
  const hoverLunchPeople = hoverLunch ? (byLunchDay.get(hoverLunch.lunchOn) ?? []) : []
  const gestureName = gesture?.personId
    ? (painters.find((painter) => painter.personId === gesture.personId)?.name ?? 'Cuidador')
    : lunchGesture?.personId
      ? (painters.find((painter) => painter.personId === lunchGesture.personId)?.name ?? 'Cuidador')
      : null
  const hoursText = rectSize === 1 ? '1 hora' : `${rectSize} horas`
  const lunchDaysText = lunchSpanDays.length === 1 ? '1 día de almuerzo' : `${lunchSpanDays.length} días de almuerzo`
  const status = lunchGesture
    ? gestureName == null
      ? `Suelta para dejar sin nadie ${lunchDaysText}. Después confirma con Guardar.`
      : lunchGesture.mode === 'paint'
        ? `Suelta para dejar a ${gestureName} a cargo de ${lunchDaysText}. Máximo ${LUNCH_PEOPLE_MAX} personas por día. Después confirma con Guardar.`
        : `Suelta para quitar a ${gestureName} de ${lunchDaysText}. Después confirma con Guardar.`
    : gesture
      ? gestureName == null
        ? `Suelta para dejar sin nadie ${hoursText}. Después confirma con Guardar.`
        : gesture.mode === 'paint'
          ? `Suelta para sumar a ${gestureName} en ${hoursText}. Quien ya esté se queda. Después confirma con Guardar.`
          : `Suelta para quitar a ${gestureName} de ${hoursText}. Los demás se quedan. Después confirma con Guardar.`
      : hover
        ? cellLabel(hover.coveredOn, hover.hour, hoverPeople.map((slot) => slot.caregiverName))
        : hoverLunch
          ? `${weekdayTitle(hoverLunch.lunchOn)} ${shortDate(hoverLunch.lunchOn)}, almuerzo. ${joinNames(hoverLunchPeople.map((slot) => slot.caregiverName))}.`
          : canEdit
            ? !canPaintSelf
              ? 'Tu cuenta no está vinculada a una persona de cuidado, así que no puedes marcar horario todavía.'
              : erasing
                ? selfOnly
                  ? 'Borrar: quitas solo tus propias horas o almuerzos. Confirma con Guardar.'
                  : 'Borrar: haz clic o arrastra sobre horas o sobre la fila amarilla de almuerzo. Confirma con Guardar.'
                : selected
                  ? selfOnly
                    ? `Estás marcando tu horario (${selected.name}). Arrastra horas o la fila amarilla de almuerzo. Confirma con Guardar.`
                    : `Estás asignando a ${selected.name}. Arrastra horas o la fila amarilla de almuerzo (máx. ${LUNCH_PEOPLE_MAX} por día). Confirma con Guardar.`
                  : 'Elige un cuidador y marca horas o la fila amarilla de almuerzo. Confirma con Guardar.'
            : 'Puedes ver quién estuvo o estará a cargo. Solo un dueño o cuidador puede marcar horas y almuerzos.'

  const bounds = data ? historyBounds(data.today) : null
  const viewYear = data ? Number(data.from.slice(0, 4)) : null
  const earliestYear = bounds ? Number(bounds.earliest.slice(0, 4)) : null
  const latestYear = bounds ? Number(bounds.latest.slice(0, 4)) : null
  const atHome = data != null && data.from === addDays(data.today, -COVERAGE_RADIUS_DAYS)

  const sliderSpan = bounds ? daysBetween(bounds.earliest, bounds.latest) : 0
  const committedIndex = bounds && data ? daysBetween(bounds.earliest, data.from) : 0
  const sliderValue = dragIndex ?? committedIndex
  const preview =
    data && bounds
      ? coverageView(data.today, shiftCoverageStart(bounds.earliest, data.today, sliderValue))
      : null

  function applySlide(index: number) {
    if (!data || !bounds) return
    if (dirtyRef.current) {
      showToast('Guarda o descarta los cambios antes de cambiar de fechas.')
      return
    }
    setError(null)
    setAnchor(shiftCoverageStart(bounds.earliest, data.today, index))
  }

  function slideTo(index: number) {
    dragRef.current = index
    setDragIndex(index)
    if (slideTimer.current) clearTimeout(slideTimer.current)
    slideTimer.current = setTimeout(() => applySlide(index), 180)
  }

  function releaseSlide() {
    const index = dragRef.current
    if (index == null) return
    if (slideTimer.current) clearTimeout(slideTimer.current)
    applySlide(index)
  }

  function moveTo(next: string) {
    if (!data) return
    if (dirtyRef.current) {
      showToast('Guarda o descarta los cambios antes de cambiar de fechas.')
      return
    }
    if (slideTimer.current) clearTimeout(slideTimer.current)
    dragRef.current = null
    setDragIndex(null)
    setError(null)
    setAnchor(clampWindowStart(next, data.today))
  }

  async function confirmEdits() {
    const current = dataRef.current
    if (!current || savingRef.current) return
    const changes = coverageDiff(savedRef.current, slotsRef.current)
    const lunchChanges = lunchDiff(savedLunchesRef.current, lunchesRef.current)
    if (changes.length === 0 && lunchChanges.length === 0) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      let next: CoveragePayload | null = null
      for (const change of changes) {
        next = await api<CoveragePayload>(`/api/patients/${patientId}/coverage?from=${current.from}`, {
          method: 'PUT',
          body: JSON.stringify(change),
        })
      }
      let lunches = lunchesRef.current
      for (const change of lunchChanges) {
        const saved = await api<{ lunches: LunchSlot[] }>(
          `/api/patients/${patientId}/lunches?from=${current.from}`,
          {
            method: 'PUT',
            body: JSON.stringify(change),
          },
        )
        lunches = saved.lunches
      }
      if (next) {
        savedRef.current = next.slots
        slotsRef.current = next.slots
        setSavedSlots(next.slots)
      }
      savedLunchesRef.current = lunches
      lunchesRef.current = lunches
      setSavedLunches(lunches)
      dirtyRef.current = false
      setData((currentData) =>
        currentData
          ? {
              ...(next ?? currentData),
              slots: next?.slots ?? currentData.slots,
              lunches,
            }
          : currentData,
      )
      setRevision((value) => value + 1)
    } catch (reason: unknown) {
      setError(errorText(reason) ?? 'No se pudo guardar el horario')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function discardEdits() {
    if (savingRef.current) return
    const saved = savedRef.current
    const lunches = savedLunchesRef.current
    slotsRef.current = saved
    lunchesRef.current = lunches
    dirtyRef.current = false
    setError(null)
    setData((current) => (current ? { ...current, slots: saved, lunches } : current))
  }

  return (
    <section data-jump="Horario de cuidado" className="mt-6" aria-busy={saving}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="coverage-heading" className="text-xl font-black">
              Horario de cuidado
            </h2>
            {data ? (
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Cada casilla es una hora, hora de Chile. Entre las 13 y las 14 hay una fila amarilla de almuerzo
                (no cuenta como cobertura horaria; máximo {LUNCH_PEOPLE_MAX} personas por día).
                {selfOnly
                  ? ' Como cuidador/a solo puedes marcar o quitar tu propio horario; el resto se ve, pero no se edita.'
                  : ' Como dueño/a puedes asignar a cualquiera. Arrastra días u horas; una hora puede tener a varias personas. Con «Borrar» dejas casillas sin nadie.'}{' '}
                Pulsa Guardar para confirmar.
              </p>
            ) : (
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Cada casilla es una hora a cargo. El historial se recorre por mes y por año.
              </p>
            )}
          </div>
          {saving ? <p className="text-sm font-bold text-blue-700">Guardando…</p> : null}
        </div>

        {data && bounds && viewYear != null && earliestYear != null && latestYear != null ? (
          <div className="mt-3 flex flex-wrap items-center gap-1">
              <button
                type="button"
                className={NAV_BUTTON}
                aria-label="Año anterior"
                disabled={dirty || viewYear <= earliestYear}
                onClick={() => moveTo(`${viewYear - 1}-${data.from.slice(5, 7)}-01`)}
              >
                ‹
              </button>
              <span className="min-w-12 text-center text-sm font-black tabular-nums">{viewYear}</span>
              <button
                type="button"
                className={NAV_BUTTON}
                aria-label="Año siguiente"
                disabled={dirty || viewYear >= latestYear}
                onClick={() => moveTo(`${viewYear + 1}-${data.from.slice(5, 7)}-01`)}
              >
                ›
              </button>
              <button
                type="button"
                aria-pressed={atHome}
                disabled={dirty}
                onClick={() => moveTo(addDays(data.today, -COVERAGE_RADIUS_DAYS))}
                className={
                  atHome
                    ? 'rounded-md bg-blue-700 px-2 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40'
                    : NAV_BUTTON
                }
              >
                Hoy
              </button>
              {MONTHS.map((label, index) => {
                const month = index + 1
                const open = monthOverlapsHistory(viewYear, month, data.today)
                const active = Number(data.from.slice(5, 7)) === month
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={!open || dirty}
                    aria-pressed={active}
                    onClick={() => moveTo(`${viewYear}-${String(month).padStart(2, '0')}-01`)}
                    className={
                      active
                        ? 'rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40'
                        : 'rounded-md px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30'
                    }
                  >
                    {label}
                  </button>
                )
              })}
          </div>
        ) : null}

        {loading && !data ? (
          <p className="mt-4 text-sm text-slate-600" role="status">
            Cargando horario…
          </p>
        ) : null}

        {error ? (
          <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true)
                setReloadToken((value) => value + 1)
              }}
              className="mt-3 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-red-800 ring-1 ring-red-200"
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {data ? (
          <>
            <p className="mt-4 text-sm font-bold text-slate-800">{coverageSummary(covered, totalHours)}</p>
            <ul className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
              <li className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-rose-200/70 ring-1 ring-rose-200" />
                Pasada sin cuidador
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-amber-200/70 ring-1 ring-amber-200" />
                Hoy o próxima sin cuidador
              </li>
              {painters.length > 1 ? (
                <li className="flex items-center gap-1.5">
                  <Flag colors={painters.slice(0, 3).map((painter) => painter.color)} className="h-3 w-5 rounded-sm" />
                  Dos o más personas a la vez, una franja por persona
                </li>
              ) : null}
              {data.days.some((day) => (careByDay[day] ?? 'home') !== 'home') ? (
                <li className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm border border-slate-200 bg-slate-100" />
                  No entra: antes del alta o en el hospital
                </li>
              ) : null}
            </ul>

            {painters.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                Todavía no hay nadie para asignar. Agrega a una persona en «Personas que cuidan».
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Cuidadores del horario">
                {painters.map((painter, index) => {
                  const active = !erasing && painter.personId === preferredId
                  const label = chipNames[index] ?? painter.name
                  const className =
                    'inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ring-1 ring-transparent'
                  const style = {
                    backgroundColor: active ? painter.color : '#ffffff',
                    color: active ? '#ffffff' : '#1e293b',
                    boxShadow: `inset 0 0 0 2px ${painter.color}`,
                  }
                  const body = (
                    <>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: active ? '#ffffff' : painter.color }}
                      />
                      <span className="truncate">{label}</span>
                      {painter.assignable && painter.userId ? null : (
                        <span className={`text-xs font-semibold ${active ? 'text-white/80' : 'text-slate-500'}`}>
                          {painter.assignable ? 'sin cuenta' : 'ya no está'}
                        </span>
                      )}
                    </>
                  )
                  const selectable =
                    canEdit &&
                    canPaintSelf &&
                    (!selfOnly || (meId != null && canEditCarePerson('caregiver', meId, painter)))
                  if (!selectable) {
                    return (
                      <span key={painter.personId} className={className} style={style} title={painter.name}>
                        {body}
                      </span>
                    )
                  }
                  const spoken =
                    painter.assignable && painter.userId
                      ? painter.name
                      : `${painter.name}, ${painter.assignable ? 'sin cuenta' : 'ya no está'}`
                  return (
                    <button
                      key={painter.personId}
                      type="button"
                      aria-pressed={active && !erasing}
                      aria-label={spoken}
                      title={painter.name}
                      onClick={() => setSelectedId(painter.personId)}
                      className={className}
                      style={style}
                    >
                      {body}
                    </button>
                  )
                })}
                {canEdit && canPaintSelf ? (
                  <button
                    type="button"
                    aria-pressed={erasing}
                    onClick={() => setSelectedId(ERASER)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ring-2 ring-inset ${
                      erasing ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-800 ring-slate-400'
                    }`}
                  >
                    <Eraser size={16} weight="bold" aria-hidden="true" />
                    Borrar
                  </button>
                ) : null}
              </div>
            )}

            {canEdit ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void confirmEdits()}
                  disabled={!dirty || saving}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={discardEdits}
                  disabled={!dirty || saving}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Descartar
                </button>
                <p className="text-sm text-slate-600">
                  {dirty
                    ? 'Hay cambios sin confirmar. Las horas no se modifican hasta que pulses Guardar. Para ver otras fechas, guarda o descarta.'
                    : 'Nada se modifica hasta que pulses Guardar.'}
                </p>
              </div>
            ) : null}

            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              {bounds && preview ? (
                <div className="border-b border-slate-200 bg-slate-50 px-2 pt-1.5 pb-1">
                  <div className="flex items-baseline justify-between gap-2 text-[11px] font-semibold text-slate-500">
                    <span>
                      {shortDate(bounds.earliest)} {bounds.earliest.slice(0, 4)}
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {shortDate(preview.from)} – {shortDate(preview.to)} {preview.to.slice(0, 4)}
                    </span>
                    <span>Flechas: una semana</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      className={NAV_BUTTON}
                      aria-label="Semana anterior"
                      disabled={
                        dirty ||
                        shiftCoverageStart(preview.from, data.today, -COVERAGE_WEEK_DAYS) === preview.from
                      }
                      onClick={() =>
                        moveTo(shiftCoverageStart(preview.from, data.today, -COVERAGE_WEEK_DAYS))
                      }
                    >
                      ‹
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={sliderSpan}
                      step={1}
                      value={Math.min(sliderValue, sliderSpan)}
                      aria-label="Desliza para recorrer los días"
                      aria-valuetext={`${shortDate(preview.from)} a ${shortDate(preview.to)} ${preview.to.slice(0, 4)}`}
                      disabled={dirty}
                      onChange={(event) => slideTo(Number(event.target.value))}
                      onPointerUp={releaseSlide}
                      onKeyUp={releaseSlide}
                      className="h-8 min-w-0 flex-1 cursor-ew-resize accent-blue-700"
                    />
                    <button
                      type="button"
                      className={NAV_BUTTON}
                      aria-label="Semana siguiente"
                      disabled={
                        dirty ||
                        shiftCoverageStart(preview.from, data.today, COVERAGE_WEEK_DAYS) === preview.from
                      }
                      onClick={() =>
                        moveTo(shiftCoverageStart(preview.from, data.today, COVERAGE_WEEK_DAYS))
                      }
                    >
                      ›
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="overflow-x-auto">
              <div
                className="grid min-w-max gap-px bg-slate-200 select-none"
                style={{ gridTemplateColumns: `2rem repeat(${data.days.length}, 1.55rem)` }}
                onPointerLeave={() => setHover(null)}
                aria-labelledby="coverage-heading"
              >
                <div className="sticky left-0 z-20 flex h-9 items-end justify-end bg-slate-100 pr-1 pb-1 text-[9px] font-bold text-slate-500">
                  Hora
                </div>
                {data.days.map((day) => {
                  const kind = careByDay[day] ?? 'home'
                  const dayCovered = coveredHourCount(namedSlots, [day])
                  const isToday = day === data.today
                  return (
                    <div
                      key={day}
                      className={`flex h-9 touch-pan-x flex-col items-center justify-center text-center text-[9px] font-bold leading-none ${
                        isToday ? 'bg-blue-700 text-white' : 'bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span>{weekdayShort(day)}</span>
                      <span className="mt-px text-[11px] leading-none">{day.slice(-2)}</span>
                      {kind === 'home' ? (
                        <span className={fractionClass(dayCovered, isToday)}>{dayCovered}/24</span>
                      ) : (
                        <span
                          className={`mt-px text-[8px] leading-none ${isToday ? 'text-slate-200' : 'text-slate-400'}`}
                          title={pausedTitle(kind)}
                        >
                          {kind === 'hospital' ? 'H' : '–'}
                        </span>
                      )}
                    </div>
                  )
                })}
                {HOURS.flatMap((hour) => [
                  <HourRow
                    key={hour}
                    hour={hour}
                    days={data.days}
                    today={data.today}
                    byCell={byCell}
                    careByDay={careByDay}
                    painters={painters}
                    gesture={gesture}
                    rect={rect}
                    canEdit={canEdit}
                    onPointerDown={onPointerDown}
                    onPointerEnter={(coveredOn, enteredHour) => {
                      setHoverLunch(null)
                      setHover({ coveredOn, hour: enteredHour })
                    }}
                    onKeyDown={onKeyDown}
                  />,
                  ...(hour === LUNCH_AFTER_HOUR
                    ? [
                        <LunchRow
                          key="lunch"
                          days={data.days}
                          today={data.today}
                          byLunchDay={byLunchDay}
                          careByDay={careByDay}
                          painters={painters}
                          gesture={lunchGesture}
                          span={lunchSpan}
                          canEdit={canEdit}
                          onPointerDown={onLunchPointerDown}
                          onPointerEnter={(lunchOn) => {
                            setHover(null)
                            setHoverLunch({ lunchOn })
                          }}
                          onKeyDown={onLunchKeyDown}
                        />,
                      ]
                    : []),
                ])}
              </div>
              </div>
            </div>
            <p className="mt-3 min-h-5 text-sm text-slate-700" aria-live="polite">
              {status}
            </p>
            <HoursPanel
              scope={scope}
              onScope={setScope}
              view={data}
              totals={totals}
              error={totalsError}
              painters={painters}
              limited={situation != null && hasCareRules(situation)}
            />
          </>
        ) : null}
      </div>
      <Toast message={toast} />
    </section>
  )
}

function dayLabel(iso: string) {
  return `${shortDate(iso)} ${iso.slice(0, 4)}`
}

function HoursPanel({
  scope,
  onScope,
  view,
  totals,
  error,
  painters,
  limited,
}: {
  scope: TotalScope
  onScope: (scope: TotalScope) => void
  view: CoveragePayload
  totals: CoverageTotals | null
  error: string | null
  painters: readonly Painter[]
  limited: boolean
}) {
  const colors = new Map<string, string>(view.people.map((person, index) => [person.id, caregiverColor(index)]))
  for (const painter of painters) colors.set(painter.personId, painter.color)
  const stale = totals != null && totals.scope !== scope
  const people = (totals?.people ?? []).map((person) => ({
    ...person,
    color: colors.get(person.personId) ?? '#64748b',
  }))
  const personHours = people.reduce((sum, person) => sum + person.hours, 0)
  const missing = totals ? Math.max(0, totals.totalHours - totals.coveredHours) : 0

  return (
    <div data-jump="Horas a cargo" className="mt-4 overflow-hidden rounded-xl border border-slate-200" aria-busy={stale}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 id="coverage-hours-heading" className="text-sm font-black text-slate-900">
          Horas a cargo
        </h3>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Periodo de las horas">
          {TOTAL_SCOPES.map((option) => {
            const active = option === scope
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => onScope(option)}
                className={
                  active
                    ? 'rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white'
                    : 'rounded-md px-2 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-white'
                }
              >
                {totalsLabel(option, totalsRange(option, view))}
              </button>
            )
          })}
        </div>
      </div>

      <div className={`px-3 py-3 ${stale ? 'opacity-60' : ''}`}>
        {error ? (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        ) : !totals ? (
          <p className="text-sm text-slate-600" role="status">
            Sumando horas…
          </p>
        ) : (
          <>
            <p className="text-xs font-semibold text-slate-500">
              {totals.totalHours > 0
                ? `Del ${dayLabel(totals.from)} al ${dayLabel(totals.to)}`
                : limited
                  ? 'Estos días no entran en el indicador.'
                  : 'Todavía no hay horas registradas'}
            </p>
            {totals.totalHours > 0 ? (
              <p className="mt-1 text-sm font-bold text-slate-800">
                {formatHours(totals.coveredHours)} de {formatHours(totals.totalHours)} con alguien a cargo (
                {percentOf(totals.coveredHours, totals.totalHours)}%).{' '}
                {missing > 0 ? `${formatHours(missing)} sin cuidador.` : 'Ninguna hora sin cuidador.'}
                {totals.sharedHours > 0 ? ` ${formatHours(totals.sharedHours)} con dos o más personas a la vez.` : ''}
              </p>
            ) : null}
            {limited ? (
              <p className="mt-1 text-xs text-slate-500">
                Las horas de los días hospitalizada o anteriores al alta no entran en esta suma.
              </p>
            ) : null}

            {people.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">Nadie tiene horas en este periodo.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-sm" aria-labelledby="coverage-hours-heading">
                  <thead>
                    <tr className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                      <th className="py-1.5 pr-3">Cuidador</th>
                      <th className="px-3 py-1.5 text-right">Horas</th>
                      <th className="px-3 py-1.5 text-right">Ya cumplidas</th>
                      <th className="px-3 py-1.5 text-right">Planificadas</th>
                      <th className="py-1.5 pl-3">Reparto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((person) => {
                      const share = percentOf(person.hours, personHours)
                      return (
                        <tr key={person.personId} className="border-t border-slate-100">
                          <td className="py-2 pr-3">
                            <span className="inline-flex items-center gap-2 font-bold text-slate-900">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: person.color }} />
                              {person.name}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-black tabular-nums">{formatHours(person.hours)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatHours(person.doneHours)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                            {formatHours(person.hours - person.doneHours)}
                          </td>
                          <td className="py-2 pl-3">
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                                <span
                                  className="block h-full rounded-full"
                                  style={{ width: `${share}%`, backgroundColor: person.color }}
                                />
                              </span>
                              <span className="text-xs font-bold tabular-nums text-slate-600">{share}%</span>
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 text-slate-700">
                      <td className="py-2 pr-3 text-xs font-bold uppercase">Suma por persona</td>
                      <td className="px-3 py-2 text-right font-black tabular-nums">{formatHours(personHours)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatHours(people.reduce((sum, person) => sum + person.doneHours, 0))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatHours(people.reduce((sum, person) => sum + person.hours - person.doneHours, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                {totals.sharedHours > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Una hora con dos personas suma una hora a cada una. Por eso la suma por persona puede ser mayor que
                    las horas con alguien a cargo.
                  </p>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function LunchRow({
  days,
  today,
  byLunchDay,
  careByDay,
  painters,
  gesture,
  span,
  canEdit,
  onPointerDown,
  onPointerEnter,
  onKeyDown,
}: {
  days: readonly string[]
  today: string
  byLunchDay: Map<string, LunchSlot[]>
  careByDay: Record<string, CareDayKind>
  painters: readonly Painter[]
  gesture: LunchGesture | null
  span: { from: string; to: string } | null
  canEdit: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerEnter: (lunchOn: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
}) {
  return (
    <>
      <div className="sticky left-0 z-10 flex h-5 items-center justify-end bg-yellow-300 pr-0.5 text-[8px] font-black tracking-wide text-yellow-950 uppercase">
        Alm
      </div>
      {days.map((day) => {
        const saved = byLunchDay.get(day) ?? []
        const inside = span != null && day >= span.from && day <= span.to
        const preview = inside && gesture ? previewLunchSlots(saved, gesture, painters, day) : saved
        const people = peopleOnCell(
          preview.map((slot) => ({
            personId: slot.personId,
            caregiverName: slot.caregiverName,
            coveredOn: slot.lunchOn,
            hour: 0,
          })),
          painters,
        )
        const names = people.map((person) => person.name)
        const kind = careByDay[day] ?? 'home'
        const paused = kind !== 'home'
        const label =
          paused && names.length === 0
            ? `${weekdayTitle(day)} ${shortDate(day)}, almuerzo. ${pausedTitle(kind)}`
            : `${weekdayTitle(day)} ${shortDate(day)}, almuerzo. ${joinNames(names)}.`
        const emptyClass = paused
          ? 'bg-yellow-200'
          : day < today
            ? 'bg-yellow-300'
            : 'bg-yellow-200'
        const flag = people.length > 0 ? <Flag colors={people.map((person) => person.color)} className="h-full w-full" /> : null
        const outline = inside ? (
          <span
            className={`pointer-events-none absolute inset-0 ring-2 ring-inset ${
              gesture?.mode === 'paint' ? 'ring-slate-900' : 'ring-red-600'
            }`}
          />
        ) : null
        if (!canEdit) {
          return (
            <div
              key={`lunch-${day}`}
              data-lunch-cell=""
              data-date={day}
              aria-label={label}
              onPointerEnter={() => onPointerEnter(day)}
              className={`h-5 ${people.length === 0 ? emptyClass : 'bg-yellow-50'}`}
            >
              {flag}
            </div>
          )
        }
        return (
          <button
            key={`lunch-${day}`}
            type="button"
            data-lunch-cell=""
            data-date={day}
            aria-label={label}
            onPointerDown={onPointerDown}
            onPointerEnter={() => onPointerEnter(day)}
            onKeyDown={onKeyDown}
            className={`relative h-5 touch-none p-0 focus-visible:outline-2 focus-visible:outline-slate-900 ${
              people.length === 0 ? emptyClass : 'bg-yellow-50'
            }`}
          >
            {flag}
            {outline}
          </button>
        )
      })}
    </>
  )
}

function HourRow({
  hour,
  days,
  today,
  byCell,
  careByDay,
  painters,
  gesture,
  rect,
  canEdit,
  onPointerDown,
  onPointerEnter,
  onKeyDown,
}: {
  hour: number
  days: readonly string[]
  today: string
  byCell: Map<string, CoverageSlot[]>
  careByDay: Record<string, CareDayKind>
  painters: readonly Painter[]
  gesture: Gesture | null
  rect: HourRect | null
  canEdit: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerEnter: (coveredOn: string, hour: number) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
}) {
  const band = hour % 2 === 0
  return (
    <>
      <div
        className={`sticky left-0 z-10 flex h-4 items-center justify-end pr-0.5 text-[9px] font-bold text-slate-500 tabular-nums ${
          band ? 'bg-slate-200/80' : 'bg-slate-50'
        }`}
      >
        {String(hour).padStart(2, '0')}
      </div>
      {days.map((day) => {
        const saved = byCell.get(`${day}|${hour}`) ?? []
        const inside = gesture != null && insideRect(rect, day, hour)
        const people = peopleOnCell(inside && gesture ? previewSlots(saved, gesture, painters, day, hour) : saved, painters)
        const names = people.map((person) => person.name)
        const kind = careByDay[day] ?? 'home'
        const paused = kind !== 'home'
        const label =
          paused && names.length === 0
            ? `${weekdayTitle(day)} ${shortDate(day)}, ${formatRange({ start: hour, end: hour + 1 })}. ${pausedTitle(kind)}`
            : cellLabel(day, hour, names)
        const emptyClass = paused
          ? band
            ? 'bg-slate-200'
            : 'bg-slate-100'
          : day < today
            ? band
              ? 'bg-rose-200/70'
              : 'bg-rose-100/70'
            : band
              ? 'bg-amber-200/70'
              : 'bg-amber-50'
        const flag = people.length > 0 ? <Flag colors={people.map((person) => person.color)} className="h-full w-full" /> : null
        const outline = inside ? (
          <span
            className={`pointer-events-none absolute inset-0 ring-2 ring-inset ${
              gesture?.mode === 'paint' ? 'ring-slate-900' : 'ring-red-600'
            }`}
          />
        ) : null
        if (!canEdit) {
          return (
            <div
              key={`${day}-${hour}`}
              data-coverage-cell=""
              data-date={day}
              data-hour={hour}
              aria-label={label}
              onPointerEnter={() => onPointerEnter(day, hour)}
              className={`h-4 ${people.length === 0 ? emptyClass : 'bg-white'}`}
            >
              {flag}
            </div>
          )
        }
        return (
          <button
            key={`${day}-${hour}`}
            type="button"
            data-coverage-cell=""
            data-date={day}
            data-hour={hour}
            aria-label={label}
            onPointerDown={onPointerDown}
            onPointerEnter={() => onPointerEnter(day, hour)}
            onKeyDown={onKeyDown}
            className={`relative h-4 touch-none p-0 focus-visible:outline-2 focus-visible:outline-slate-900 ${
              people.length === 0 ? emptyClass : 'bg-white'
            }`}
          >
            {flag}
            {outline}
          </button>
        )
      })}
    </>
  )
}

function previewSlots(
  saved: readonly CoverageSlot[],
  gesture: Gesture,
  painters: readonly Painter[],
  coveredOn: string,
  hour: number,
): CoverageSlot[] {
  if (gesture.personId == null) return []
  const personId = gesture.personId
  const others = saved.filter((slot) => slot.personId !== personId)
  if (gesture.mode === 'erase') return others
  const caregiverName = painters.find((painter) => painter.personId === personId)?.name ?? 'Cuidador'
  return [...others, { personId, caregiverName, coveredOn, hour }]
}

function previewLunchSlots(
  saved: readonly LunchSlot[],
  gesture: LunchGesture,
  painters: readonly Painter[],
  lunchOn: string,
): LunchSlot[] {
  if (gesture.personId == null) return []
  const personId = gesture.personId
  const others = saved.filter((slot) => slot.personId !== personId)
  if (gesture.mode === 'erase') return others
  if (others.length >= LUNCH_PEOPLE_MAX) return [...saved]
  const caregiverName = painters.find((painter) => painter.personId === personId)?.name ?? 'Cuidador'
  return [...others, { personId, caregiverName, lunchOn }]
}

function Flag({ colors, className }: { colors: readonly string[]; className: string }) {
  return (
    <span className={`pointer-events-none flex gap-px overflow-hidden bg-white ${className}`}>
      {colors.map((color, index) => (
        <span key={`${color}-${index}`} className="h-full min-w-0 flex-1" style={{ backgroundColor: color }} />
      ))}
    </span>
  )
}
