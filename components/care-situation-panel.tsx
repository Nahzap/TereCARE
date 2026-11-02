'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { Role } from '@/lib/domain'
import type { CareSituation, HospitalStay } from '@/lib/care/situation'
import { shortDate } from '@/lib/schedule/dates'
import { api, errorText } from '@/components/api'
import { FieldLabel, fieldClass } from '@/components/modal'

type Payload = CareSituation & { role: Role }

function dayLabel(iso: string) {
  return `${shortDate(iso)} ${iso.slice(0, 4)}`
}

export function CareSituationPanel({
  patientId,
  onChange,
  onToast,
}: {
  patientId: string
  onChange: () => void
  onToast: (message: string) => void
}) {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [discharge, setDischarge] = useState('')
  const [admittedOn, setAdmittedOn] = useState('')
  const [stayDischarge, setStayDischarge] = useState('')
  const [releaseOn, setReleaseOn] = useState('')

  useEffect(() => {
    let cancelled = false
    api<Payload>(`/api/patients/${patientId}/care-situation`)
      .then((data) => {
        if (cancelled) return
        setPayload(data)
        setDischarge(data.dischargedOn ?? '')
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason) ?? 'No se pudo cargar la situación de cuidado')
      })
    return () => {
      cancelled = true
    }
  }, [patientId])

  const owner = payload?.role === 'owner'

  function apply(next: Payload, message: string) {
    setPayload(next)
    setDischarge(next.dischargedOn ?? '')
    setFormError(null)
    setAdmittedOn('')
    setStayDischarge('')
    setReleaseOn('')
    onToast(message)
    onChange()
  }

  async function saveDischarge(event: FormEvent) {
    event.preventDefault()
    if (!owner || !discharge) return
    setSaving(true)
    setFormError(null)
    try {
      const next = await api<Payload>(`/api/patients/${patientId}/care-situation`, {
        method: 'PUT',
        body: JSON.stringify({ dischargedOn: discharge }),
      })
      apply(next, 'Fecha de alta guardada')
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo guardar la fecha de alta')
    } finally {
      setSaving(false)
    }
  }

  async function clearDischarge() {
    if (!owner || !payload?.dischargedOn) return
    if (!window.confirm('¿Quitar la fecha de alta? El dashboard volverá a contar todos los días.')) return
    setSaving(true)
    setFormError(null)
    try {
      const next = await api<Payload>(`/api/patients/${patientId}/care-situation`, {
        method: 'PUT',
        body: JSON.stringify({ dischargedOn: null }),
      })
      apply(next, 'Fecha de alta quitada')
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo quitar la fecha de alta')
    } finally {
      setSaving(false)
    }
  }

  async function addStay(event: FormEvent) {
    event.preventDefault()
    if (!owner || !admittedOn) return
    setSaving(true)
    setFormError(null)
    try {
      const next = await api<Payload>(`/api/patients/${patientId}/care-situation/hospitalizations`, {
        method: 'POST',
        body: JSON.stringify({ admittedOn, dischargedOn: stayDischarge || null }),
      })
      apply(next, 'Hospitalización registrada')
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo registrar la hospitalización')
    } finally {
      setSaving(false)
    }
  }

  async function closeStay(stay: HospitalStay) {
    if (!owner || !releaseOn) return
    setSaving(true)
    setFormError(null)
    try {
      const next = await api<Payload>(`/api/patients/${patientId}/care-situation/hospitalizations/${stay.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ admittedOn: stay.admittedOn, dischargedOn: releaseOn }),
      })
      apply(next, 'Alta de la hospitalización registrada')
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo registrar el alta')
    } finally {
      setSaving(false)
    }
  }

  async function removeStay(stay: HospitalStay) {
    if (!owner) return
    if (!window.confirm('¿Quitar esta hospitalización? Esos días volverán a contar en el dashboard.')) return
    setSaving(true)
    setFormError(null)
    try {
      const next = await api<Payload>(`/api/patients/${patientId}/care-situation/hospitalizations/${stay.id}`, {
        method: 'DELETE',
      })
      apply(next, 'Hospitalización quitada')
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo quitar la hospitalización')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section data-jump="Situación de cuidado" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="care-situation-heading">
      <h2 id="care-situation-heading" className="text-xl font-black">
        Situación de cuidado
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        La fecha de alta es el primer día en casa. Desde ese día el cuidado cuenta para el dashboard. Los días anteriores,
        y los días en que está hospitalizada, no bajan los indicadores: las horas vacías y las tomas sin marcar de esos
        días quedan fuera. El día del alta hospitalaria vuelve a contar como en casa.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </p>
      ) : !payload ? (
        <p className="mt-4 text-sm text-slate-600" role="status">
          Cargando situación…
        </p>
      ) : (
        <div className="mt-4 grid gap-4">
          <form onSubmit={saveDischarge} className="grid gap-3 sm:grid-cols-[12rem_auto_auto] sm:items-end">
            <div>
              <FieldLabel htmlFor="care-discharge">Fecha de alta</FieldLabel>
              <input
                id="care-discharge"
                type="date"
                value={discharge}
                disabled={!owner || saving}
                onChange={(event) => setDischarge(event.target.value)}
                className={fieldClass}
              />
            </div>
            {owner ? (
              <>
                <button
                  type="submit"
                  disabled={saving || !discharge || discharge === payload.dischargedOn}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Guardar alta
                </button>
                <button
                  type="button"
                  disabled={saving || !payload.dischargedOn}
                  onClick={clearDischarge}
                  className="rounded-full px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Quitar fecha
                </button>
              </>
            ) : null}
          </form>
          <p className="text-sm text-slate-600">
            {payload.dischargedOn
              ? `En casa desde el ${dayLabel(payload.dischargedOn)}. Ese día ya cuenta.`
              : 'Sin fecha de alta, el dashboard cuenta todos los días. Regístrala para dejar fuera lo anterior.'}
          </p>

          <div>
            <h3 className="text-sm font-black text-slate-900">Hospitalizaciones</h3>
            {payload.hospitalizations.length === 0 ? (
              <p className="mt-1 text-sm text-slate-600">No hay hospitalizaciones registradas.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {payload.hospitalizations.map((stay) => (
                  <li key={stay.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <p className="font-bold text-slate-900">Ingreso el {dayLabel(stay.admittedOn)}</p>
                    {stay.dischargedOn ? (
                      <p className="text-slate-600">
                        Alta el {dayLabel(stay.dischargedOn)}: desde ese día vuelve a contar como en casa.
                      </p>
                    ) : (
                      <p className="text-slate-600">Sigue hospitalizada. Desde el ingreso, esos días no entran en el indicador.</p>
                    )}
                    {owner && !stay.dischargedOn ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div>
                          <FieldLabel htmlFor={`release-${stay.id}`}>Alta de esta hospitalización</FieldLabel>
                          <input
                            id={`release-${stay.id}`}
                            type="date"
                            min={stay.admittedOn}
                            value={releaseOn}
                            disabled={saving}
                            onChange={(event) => setReleaseOn(event.target.value)}
                            className={fieldClass}
                          />
                        </div>
                        <button
                          type="button"
                          disabled={saving || !releaseOn}
                          onClick={() => closeStay(stay)}
                          className="rounded-full bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Registrar el alta
                        </button>
                      </div>
                    ) : null}
                    {owner ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => removeStay(stay)}
                        className="mt-2 text-sm font-bold text-red-700"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {owner ? (
            <form onSubmit={addStay} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[12rem_12rem_auto] sm:items-end">
              <div>
                <FieldLabel htmlFor="stay-admitted">Ingreso</FieldLabel>
                <input
                  id="stay-admitted"
                  type="date"
                  required
                  value={admittedOn}
                  disabled={saving}
                  onChange={(event) => setAdmittedOn(event.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="stay-discharged">Alta, si ya volvió</FieldLabel>
                <input
                  id="stay-discharged"
                  type="date"
                  min={admittedOn || undefined}
                  value={stayDischarge}
                  disabled={saving}
                  onChange={(event) => setStayDischarge(event.target.value)}
                  className={fieldClass}
                />
              </div>
              <button
                type="submit"
                disabled={saving || !admittedOn}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Registrar hospitalización
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Solo quien administra el cuidado puede cambiar estas fechas.</p>
          )}

          {formError ? (
            <p role="alert" className="text-sm text-red-700">
              {formError}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
