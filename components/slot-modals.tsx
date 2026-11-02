'use client'

import { useState, type FormEvent } from 'react'
import type { Slot, SlotDraft, SlotKind } from '@/lib/domain'
import { api, errorText } from '@/components/api'
import { formatDMY, hourChoices } from '@/components/format'
import { FieldLabel, Modal, fieldClass } from '@/components/modal'
import { earliestHourDate, planHourChange } from '@/lib/schedule/hour-change'
import { todayISO } from '@/lib/schedule/dates'

const KIND_OPTIONS: { value: SlotKind; label: string }[] = [
  { value: 'fixed', label: 'Permanente' },
  { value: 'until', label: 'Hasta una fecha' },
  { value: 'sos', label: 'Solo si hay dolor' },
]

function emptyDraft(hour: string): SlotDraft {
  return { name: '', brandName: '', dose: '', hour, kind: 'fixed', endDate: null, note: '' }
}

function draftFromSlot(slot: Slot): SlotDraft {
  return {
    name: slot.name,
    brandName: slot.brandName,
    dose: slot.dose,
    hour: slot.hour,
    kind: slot.kind,
    endDate: slot.endDate,
    note: slot.note,
  }
}

export function SlotFormModal({
  patientId,
  slot,
  initialHour,
  takenToday = false,
  onClose,
  onSaved,
}: {
  patientId: string
  slot: Slot | null
  initialHour: string
  takenToday?: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const today = todayISO()
  const earliest = earliestHourDate(today, takenToday)
  const [draft, setDraft] = useState<SlotDraft>(slot ? draftFromSlot(slot) : emptyDraft(initialHour))
  const [effectiveOn, setEffectiveOn] = useState(earliest)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const hourPlan =
    slot && draft.hour !== slot.hour
      ? planHourChange({
          previousHour: slot.hour,
          nextHour: draft.hour,
          today,
          takenToday,
          effectiveOn,
          startsOn: slot.startsOn,
          endDate: slot.endDate,
          replacedOn: slot.replacedOn,
          createdOn: slot.startsOn ?? '1900-01-01',
        })
      : null
  const termError =
    slot &&
    draft.hour !== slot.hour &&
    draft.kind === 'until' &&
    draft.endDate &&
    draft.endDate < effectiveOn
      ? 'Este medicamento ya no tiene ingestas desde esa fecha.'
      : null
  const hourError = termError ?? (hourPlan?.action === 'reject' ? hourPlan.message : null)

  function update<K extends keyof SlotDraft>(key: K, value: SlotDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body: SlotDraft = {
      name: draft.name.trim(),
      brandName: draft.brandName.trim(),
      dose: draft.dose.trim(),
      hour: draft.hour,
      kind: draft.kind,
      endDate: draft.kind === 'until' ? draft.endDate : null,
      note: draft.note.trim(),
    }
    if (!body.name || !body.dose || !body.note) {
      setError('Falta el nombre científico, el gramaje o la posología')
      return
    }
    if (body.kind === 'until' && !body.endDate) {
      setError('Indica la fecha de término')
      return
    }
    if (hourError) {
      setError(hourError)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (slot) {
        const payload = body.hour === slot.hour ? body : { ...body, effectiveOn }
        await api<Slot>(`/api/slots/${slot.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        onSaved(body.hour === slot.hour ? 'Medicamento actualizado' : 'La hora nueva queda para los DAR pendientes')
      } else {
        await api<Slot>(`/api/patients/${patientId}/slots`, { method: 'POST', body: JSON.stringify(body) })
        onSaved('Medicamento agregado')
      }
    } catch (reason) {
      const message = errorText(reason)
      if (message) setError(message)
      setSaving(false)
    }
  }

  async function remove() {
    if (!slot) return
    if (!window.confirm(`¿Eliminar ${slot.name}?`)) return
    setSaving(true)
    setError(null)
    try {
      await api(`/api/slots/${slot.id}`, { method: 'DELETE' })
      onSaved('Medicamento eliminado')
    } catch (reason) {
      const message = errorText(reason)
      if (message) setError(message)
      setSaving(false)
    }
  }

  return (
    <Modal title={slot ? 'Editar posología' : 'Agregar posología'} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="text-sm text-slate-600">
          Nombre científico, gramaje, nombre comercial y cómo se administra. Cada paciente tiene la suya.
        </p>
        <FieldLabel htmlFor="slot-name">Nombre científico</FieldLabel>
        <input
          id="slot-name"
          value={draft.name}
          onChange={(event) => update('name', event.target.value)}
          maxLength={120}
          required
          placeholder="Paracetamol"
          className={fieldClass}
        />
        <FieldLabel htmlFor="slot-dose">Gramaje</FieldLabel>
        <input
          id="slot-dose"
          value={draft.dose}
          onChange={(event) => update('dose', event.target.value)}
          maxLength={60}
          required
          placeholder="500 mg"
          className={fieldClass}
        />
        <FieldLabel htmlFor="slot-brand">Nombre comercial</FieldLabel>
        <input
          id="slot-brand"
          value={draft.brandName}
          onChange={(event) => update('brandName', event.target.value)}
          maxLength={120}
          placeholder="Si la caja trae otra marca"
          className={fieldClass}
        />
        <FieldLabel htmlFor="slot-hour">Hora</FieldLabel>
        <select
          id="slot-hour"
          value={draft.hour}
          onChange={(event) => update('hour', event.target.value)}
          className={fieldClass}
        >
          {hourChoices(draft.hour).map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>
        {slot ? (
          <p className="mt-1 text-sm text-slate-600">
            {takenToday
              ? `La ingesta de hoy ya está tomada. Los tomados se quedan a las ${slot.hour}. La hora nueva puede partir desde mañana.`
              : `Los tomados se quedan a las ${slot.hour}. Si cambias la hora, solo se mueven los DAR pendientes, desde hoy.`}
          </p>
        ) : null}
        {slot && draft.hour !== slot.hour ? (
          <>
            <FieldLabel htmlFor="slot-effective">Desde</FieldLabel>
            <input
              id="slot-effective"
              type="date"
              min={earliest}
              value={effectiveOn}
              onChange={(event) => setEffectiveOn(event.target.value)}
              required
              className={fieldClass}
            />
            <p className="mt-1 text-sm text-slate-600">
              Desde el {formatDMY(effectiveOn || earliest)}, los DAR pendientes pasan a las {draft.hour}. Los días
              anteriores y los tomados siguen a las {slot.hour}.
            </p>
          </>
        ) : null}
        <FieldLabel htmlFor="slot-kind">Tiempo de administración</FieldLabel>
        <select
          id="slot-kind"
          value={draft.kind}
          onChange={(event) => update('kind', event.target.value as SlotKind)}
          className={fieldClass}
        >
          {KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {draft.kind === 'until' ? (
          <>
            <FieldLabel htmlFor="slot-end">Fecha de término</FieldLabel>
            <input
              id="slot-end"
              type="date"
              value={draft.endDate ?? ''}
              onChange={(event) => update('endDate', event.target.value || null)}
              required
              className={fieldClass}
            />
          </>
        ) : null}
        <FieldLabel htmlFor="slot-note">Administración y posología</FieldLabel>
        <textarea
          id="slot-note"
          value={draft.note}
          onChange={(event) => update('note', event.target.value)}
          maxLength={300}
          rows={3}
          required
          placeholder="Vía oral, 1 comprimido cada 8 horas"
          className={fieldClass}
        />
        {error || hourError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error || hourError}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {slot ? (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="rounded-full px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Eliminar
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || hourError != null}
              className="rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
