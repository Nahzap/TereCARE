'use client'

import { Pill, Plus } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import type { Me, PatientListItem } from '@/lib/domain'
import { api, errorText } from '@/components/api'
import { ROLE_LABEL } from '@/components/format'
import { FieldLabel, Modal, fieldClass } from '@/components/modal'

export function PatientsHome() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [patients, setPatients] = useState<PatientListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all([api<Me>('/api/me'), api<PatientListItem[]>('/api/patients')])
      .then(([profile, list]) => {
        if (cancelled) return
        setMe(profile)
        setPatients(list)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        const message = errorText(reason)
        if (message) setError(message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const displayName = me?.fullName?.trim() || me?.email || ''

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-white">
            <Pill size={26} weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-3xl font-black tracking-tight">TereCARE</h1>
            {displayName ? <p className="text-sm text-slate-600">{displayName}</p> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/acceso"
            className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-bold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Acceso
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
          >
            <Plus size={16} weight="bold" aria-hidden />
            Nuevo paciente
          </button>
        </div>
      </header>

      <div className="mt-8">
        {loading && patients === null ? (
          <p className="text-sm font-medium text-slate-600" role="status">
            Cargando pacientes…
          </p>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true)
                setError(null)
                setReloadToken((value) => value + 1)
              }}
              className="mt-3 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-red-800 ring-1 ring-red-200"
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {patients && patients.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-slate-600">
            Todavía no tienes pacientes.
          </p>
        ) : null}

        {patients && patients.length > 0 ? (
          <ul className="grid gap-3">
            {patients.map((patient) => {
              const complete = patient.todayFixedTotal > 0 && patient.todayFixedDone === patient.todayFixedTotal
              return (
                <li key={patient.id} data-jump={patient.fullName}>
                  <Link
                    href={`/pacientes/${patient.id}`}
                    className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm outline-none transition hover:border-blue-300 focus-visible:ring-2 focus-visible:ring-blue-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-black">{patient.fullName}</h2>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                        {ROLE_LABEL[patient.role]}
                      </span>
                    </div>
                    <p className={`mt-2 text-sm font-semibold ${complete ? 'text-emerald-700' : 'text-slate-600'}`}>
                      {patient.todayFixedDone} de {patient.todayFixedTotal} fijos hoy
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      {open ? (
        <NewPatientModal
          onClose={() => setOpen(false)}
          onCreated={(id) => router.push(`/pacientes/${id}?seccion=posologia`)}
        />
      ) : null}
    </div>
  )
}

function NewPatientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [fullName, setFullName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = fullName.trim()
    if (!name) {
      setFormError('Escribe el nombre')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const created = await api<{ id: string }>('/api/patients', {
        method: 'POST',
        body: JSON.stringify({ fullName: name, templateKey: null }),
      })
      onCreated(created.id)
    } catch (reason) {
      const message = errorText(reason)
      if (message) setFormError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Nuevo paciente" onClose={onClose}>
      <form onSubmit={submit}>
        <FieldLabel htmlFor="patient-name">Nombre de la persona</FieldLabel>
        <input
          id="patient-name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          maxLength={120}
          required
          autoComplete="name"
          placeholder="Por ejemplo, Luis Cerda"
          className={fieldClass}
        />
        <p className="mt-3 text-sm text-slate-600">
          Al crear, se abre la posología para agregar, editar o borrar los medicamentos.
        </p>
        {formError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {formError}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? 'Creando…' : 'Crear paciente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
