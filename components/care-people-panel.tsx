'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { Role } from '@/lib/domain'
import { mergeTargets, personStatus, type CarePersonDetail } from '@/lib/coverage/people'
import { caregiverColor, formatHours } from '@/lib/coverage/schedule'
import { api, errorText } from '@/components/api'
import { FieldLabel, fieldClass, Modal } from '@/components/modal'

type PeoplePayload = { role: Role; people: CarePersonDetail[] }

type Dialog = { kind: 'edit'; person: CarePersonDetail } | { kind: 'merge'; person: CarePersonDetail } | null

function noted(message: string, phoneSaved: boolean | undefined) {
  return phoneSaved === false ? `${message}. El teléfono todavía no está en la base de datos` : message
}

export function CarePeoplePanel({
  patientId,
  revision = 0,
  onChange,
  onToast,
}: {
  patientId: string
  revision?: number
  onChange: () => void
  onToast: (message: string) => void
}) {
  const [payload, setPayload] = useState<PeoplePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [localRevision, setLocalRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    api<PeoplePayload>(`/api/patients/${patientId}/people`)
      .then((data) => {
        if (cancelled) return
        setPayload(data)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason) ?? 'No se pudo cargar a las personas')
      })
    return () => {
      cancelled = true
    }
  }, [patientId, revision, localRevision])

  const isOwner = payload?.role === 'owner'
  const people = payload?.people ?? []

  function changed(message: string) {
    setDialog(null)
    setLocalRevision((value) => value + 1)
    onChange()
    onToast(message)
  }

  async function run(action: () => Promise<string>) {
    setSaving(true)
    setFormError(null)
    try {
      changed(await action())
      return true
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo guardar')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const done = await run(async () => {
      const result = await api<{ invited: boolean; phoneSaved?: boolean }>(`/api/patients/${patientId}/people`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() }),
      })
      const added = result.invited ? 'Persona agregada e invitada' : 'Persona agregada'
      return noted(added, result.phoneSaved)
    })
    if (done) {
      setName('')
      setEmail('')
      setPhone('')
    }
  }

  async function remove(person: CarePersonDetail) {
    const detail = person.hours > 0 ? ` Se borrarán sus ${formatHours(person.hours)} del horario.` : ''
    if (!window.confirm(`¿Quitar a ${person.name}?${detail}`)) return
    await run(async () => {
      await api(`/api/patients/${patientId}/people/${person.id}`, { method: 'DELETE' })
      return 'Persona quitada'
    })
  }

  return (
    <section data-jump="Personas que cuidan" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="care-people-heading">
      <h2 id="care-people-heading" className="text-xl font-black">
        Personas que cuidan
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Agrega a quienes cuidan aunque todavía no tengan cuenta, con nombre, correo y teléfono. Si anotas el correo,
        queda invitada: cuando entre con ese correo, su cuenta se une a esta misma persona, con su nombre y sus horas.
        Si entra con otro correo, usa Fusionar para unir a las dos sin duplicar horas.
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {!payload && !error ? (
        <p className="mt-3 text-sm text-slate-600" role="status">
          Cargando personas…
        </p>
      ) : null}

      {payload ? (
        <ul className="mt-4 grid gap-2">
          {people.length === 0 ? (
            <li className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600">
              Todavía no hay personas.
            </li>
          ) : null}
          {people.map((person, index) => (
            <li
              key={person.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: caregiverColor(index) }}
                />
                <div className="min-w-0">
                  <p className="font-bold">{person.name}</p>
                  <p className="text-sm text-slate-500">
                    {[personStatus(person), person.email, person.phone, formatHours(person.hours)].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              {isOwner ? (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setDialog({ kind: 'edit', person })}
                    className="rounded-full px-3 py-1.5 text-sm font-bold text-blue-700 hover:bg-blue-50"
                  >
                    Editar
                  </button>
                  {person.userId ? null : (
                    <>
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: 'merge', person })}
                        disabled={mergeTargets(people, person.id).length === 0}
                        className="rounded-full px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      >
                        Fusionar
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(person)}
                        disabled={saving}
                        className="rounded-full px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50"
                      >
                        Quitar
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {formError && !dialog ? (
        <p role="alert" className="mt-3 text-sm font-medium text-red-700">
          {formError}
        </p>
      ) : null}

      {isOwner ? (
        <form onSubmit={add} className="mt-4 grid gap-x-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
          <div>
            <FieldLabel htmlFor="person-name">Nombre</FieldLabel>
            <input
              id="person-name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Por ejemplo, Pilar"
              className={fieldClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="person-email">Correo (opcional)</FieldLabel>
            <input
              id="person-email"
              type="email"
              maxLength={254}
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Si lo sabes"
              className={fieldClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="person-phone">Teléfono (opcional)</FieldLabel>
            <input
              id="person-phone"
              type="tel"
              maxLength={24}
              autoComplete="off"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+56 9 1234 5678"
              className={fieldClass}
            />
          </div>
          <button
            type="submit"
            disabled={saving || name.trim() === ''}
            className="mt-3 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Agregar persona'}
          </button>
        </form>
      ) : null}

      {dialog?.kind === 'edit' ? (
        <EditPerson
          person={dialog.person}
          saving={saving}
          error={formError}
          onClose={() => {
            setDialog(null)
            setFormError(null)
          }}
          onSave={(changes) =>
            run(async () => {
              const result = await api<{ phoneSaved?: boolean }>(`/api/patients/${patientId}/people/${dialog.person.id}`, {
                method: 'PATCH',
                body: JSON.stringify(changes),
              })
              return noted('Persona actualizada', result.phoneSaved)
            })
          }
        />
      ) : null}

      {dialog?.kind === 'merge' ? (
        <MergePerson
          person={dialog.person}
          targets={mergeTargets(people, dialog.person.id)}
          saving={saving}
          error={formError}
          onClose={() => {
            setDialog(null)
            setFormError(null)
          }}
          onMerge={(target) =>
            run(async () => {
              const result = await api<{ moved: number; duplicates: number }>(
                `/api/patients/${patientId}/people/${dialog.person.id}/merge`,
                { method: 'POST', body: JSON.stringify({ targetId: target.id }) },
              )
              const repeated = result.duplicates > 0 ? ` ${formatHours(result.duplicates)} repetidas no se duplicaron.` : ''
              return `${dialog.person.name} quedó unida a ${target.name}: ${formatHours(result.moved)} pasaron.${repeated}`
            })
          }
        />
      ) : null}
    </section>
  )
}

function EditPerson({
  person,
  saving,
  error,
  onClose,
  onSave,
}: {
  person: CarePersonDetail
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (changes: { name: string; email?: string; phone?: string }) => void
}) {
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email ?? '')
  const [phone, setPhone] = useState(person.phone ?? '')

  return (
    <Modal title={`Editar a ${person.name}`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSave(
            person.userId
              ? { name: name.trim(), phone: phone.trim() }
              : { name: name.trim(), email: email.trim(), phone: phone.trim() },
          )
        }}
      >
        <FieldLabel htmlFor="edit-person-name">Nombre en el horario</FieldLabel>
        <input
          id="edit-person-name"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
        />
        {person.userId ? (
          <p className="mt-3 text-sm text-slate-600">Ya entró con {person.email || 'su cuenta'}; su correo no se cambia aquí.</p>
        ) : (
          <>
            <FieldLabel htmlFor="edit-person-email">Correo (opcional)</FieldLabel>
            <input
              id="edit-person-email"
              type="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={fieldClass}
            />
            <p className="mt-2 text-xs text-slate-500">
              Al guardar un correo, queda invitada como cuidadora. Si lo borras, se cancela su invitación pendiente.
            </p>
          </>
        )}
        <FieldLabel htmlFor="edit-person-phone">Teléfono (opcional)</FieldLabel>
        <input
          id="edit-person-phone"
          type="tel"
          maxLength={24}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+56 9 1234 5678"
          className={fieldClass}
        />
        {error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving || name.trim() === ''}
          className="mt-4 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </Modal>
  )
}

function MergePerson({
  person,
  targets,
  saving,
  error,
  onClose,
  onMerge,
}: {
  person: CarePersonDetail
  targets: CarePersonDetail[]
  saving: boolean
  error: string | null
  onClose: () => void
  onMerge: (target: CarePersonDetail) => void
}) {
  const [targetId, setTargetId] = useState(targets.find((target) => target.userId)?.id ?? targets[0]?.id ?? '')
  const target = targets.find((entry) => entry.id === targetId) ?? null

  return (
    <Modal title={`Fusionar a ${person.name}`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (target) onMerge(target)
        }}
      >
        <p className="text-sm text-slate-600">
          Úsalo cuando {person.name} es la misma persona que otra de la lista, por ejemplo si entró con un correo
          distinto. Sus horas pasan a la persona que elijas; las horas que ya tenga no se duplican. Después,{' '}
          {person.name} deja de aparecer.
        </p>
        <FieldLabel htmlFor="merge-target">Unir con</FieldLabel>
        <select
          id="merge-target"
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          className={fieldClass}
        >
          {targets.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} · {entry.userId ? entry.email || 'con cuenta' : 'sin cuenta'}
            </option>
          ))}
        </select>
        {target ? (
          <p className="mt-3 text-sm font-semibold text-slate-800">
            {formatHours(person.hours)} de {person.name} pasarán a {target.name}, que hoy tiene {formatHours(target.hours)}.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving || !target}
          className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Fusionando…' : 'Fusionar'}
        </button>
      </form>
    </Modal>
  )
}
