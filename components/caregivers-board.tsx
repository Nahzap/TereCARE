'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import type { Invite, Member, PatientDetail } from '@/lib/domain'
import { api, errorText } from '@/components/api'
import { CarePeoplePanel } from '@/components/care-people-panel'
import { CareSituationPanel } from '@/components/care-situation-panel'
import { CoverageBoard } from '@/components/coverage-board'
import { ROLE_LABEL } from '@/components/format'
import { FieldLabel, fieldClass } from '@/components/modal'
import { Toast, useToast } from '@/components/use-toast'

type AccessPayload = { members: Member[]; invites: Invite[] }

export function CaregiversBoard({ patientId }: { patientId: string }) {
  const router = useRouter()
  const { toast, showToast } = useToast()
  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'caregiver' | 'viewer'>('caregiver')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [peopleRevision, setPeopleRevision] = useState(0)
  const [careRevision, setCareRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api<PatientDetail>(`/api/patients/${patientId}`),
      api<AccessPayload>(`/api/patients/${patientId}/members`),
    ])
      .then(([detail, access]) => {
        if (cancelled) return
        setPatient(detail)
        setName(detail.fullName)
        setMembers(access.members ?? [])
        setInvites(access.invites ?? [])
        setError(null)
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
  }, [patientId, reloadToken])

  const isOwner = patient?.role === 'owner'

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await api(`/api/patients/${patientId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), role }),
      })
      setEmail('')
      showToast('Invitación enviada')
      setLoading(true)
      setReloadToken((value) => value + 1)
    } catch (reason) {
      const message = errorText(reason)
      if (message) setFormError(message)
    } finally {
      setSaving(false)
    }
  }

  async function removeMember(member: Member) {
    const label = member.fullName?.trim() || member.email
    if (!window.confirm(`¿Quitar a ${label}?`)) return
    setFormError(null)
    try {
      await api(`/api/patients/${patientId}/members/${member.userId}`, { method: 'DELETE' })
      showToast('Persona quitada')
      setLoading(true)
      setReloadToken((value) => value + 1)
      setPeopleRevision((value) => value + 1)
    } catch (reason) {
      const message = errorText(reason)
      if (message) setFormError(message)
    }
  }

  async function removeInvite(inviteItem: Invite) {
    if (!window.confirm(`¿Cancelar la invitación a ${inviteItem.email}?`)) return
    setFormError(null)
    try {
      await api(`/api/patients/${patientId}/invites/${inviteItem.id}`, { method: 'DELETE' })
      showToast('Invitación cancelada')
      setLoading(true)
      setReloadToken((value) => value + 1)
    } catch (reason) {
      const message = errorText(reason)
      if (message) setFormError(message)
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fullName = name.trim()
    if (!fullName) {
      setFormError('Escribe el nombre')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api(`/api/patients/${patientId}`, {
        method: 'PATCH',
        body: JSON.stringify({ fullName }),
      })
      setPatient((current) => (current ? { ...current, fullName } : current))
      setName(fullName)
      showToast('Nombre actualizado')
    } catch (reason) {
      const message = errorText(reason)
      if (message) setFormError(message)
    } finally {
      setSaving(false)
    }
  }

  async function removePatient() {
    if (!patient) return
    if (!window.confirm(`¿Eliminar a ${patient.fullName}? Esta acción no se puede deshacer.`)) return
    setSaving(true)
    setFormError(null)
    try {
      await api(`/api/patients/${patientId}`, { method: 'DELETE' })
      router.push('/pacientes')
    } catch (reason) {
      const message = errorText(reason)
      if (message) setFormError(message)
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8">
      <h1 className="text-3xl font-black tracking-tight">Cuidadores</h1>
      {patient ? <p className="mt-1 text-slate-600">{patient.fullName}</p> : null}

      {loading && !patient ? (
        <p className="mt-6 text-sm text-slate-600" role="status">
          Cargando cuidadores…
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
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

      {patient ? (
        <>
          <CareSituationPanel
            patientId={patientId}
            onToast={showToast}
            onChange={() => setCareRevision((value) => value + 1)}
          />
          <CarePeoplePanel
            patientId={patientId}
            onToast={showToast}
            onChange={() => {
              setPeopleRevision((value) => value + 1)
              setReloadToken((value) => value + 1)
            }}
          />
          <CoverageBoard patientId={patientId} peopleRevision={peopleRevision} careRevision={careRevision} />
          <div className="max-w-2xl">
          <ul data-jump="Cuentas con acceso" className="mt-6 grid gap-2">
            {members.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
                Nadie tiene acceso todavía.
              </li>
            ) : (
              members.map((member) => (
                <li
                  key={member.userId}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-bold">{member.fullName?.trim() || member.email}</p>
                    {member.fullName?.trim() ? <p className="text-sm text-slate-500">{member.email}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                      {ROLE_LABEL[member.role]}
                    </span>
                    {isOwner && member.role !== 'owner' ? (
                      <button
                        type="button"
                        onClick={() => removeMember(member)}
                        className="rounded-full px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>

          {formError ? (
            <p role="alert" className="mt-4 text-sm font-medium text-red-700">
              {formError}
            </p>
          ) : null}

          {isOwner ? (
            <form data-jump="Invitar" onSubmit={invite} className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-black">Invitar</h2>
              <FieldLabel htmlFor="invite-email">Correo</FieldLabel>
              <input
                id="invite-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={fieldClass}
              />
              <FieldLabel htmlFor="invite-role">Rol</FieldLabel>
              <select
                id="invite-role"
                value={role}
                onChange={(event) => setRole(event.target.value === 'viewer' ? 'viewer' : 'caregiver')}
                className={fieldClass}
              >
                <option value="caregiver">Cuidador</option>
                <option value="viewer">Solo lectura</option>
              </select>
              <button
                type="submit"
                disabled={saving}
                className="mt-4 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? 'Enviando…' : 'Invitar'}
              </button>
            </form>
          ) : null}

          {isOwner ? (
            <section data-jump="Invitaciones pendientes" className="mt-6">
              <h2 className="font-black">Invitaciones pendientes</h2>
              {invites.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No hay invitaciones pendientes.</p>
              ) : (
                <ul className="mt-2 grid gap-2">
                  {invites.map((inviteItem) => (
                    <li
                      key={inviteItem.id}
                      className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-bold">{inviteItem.email}</p>
                        <p className="text-sm text-slate-500">{ROLE_LABEL[inviteItem.role]}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeInvite(inviteItem)}
                        className="rounded-full px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {isOwner ? (
            <section data-jump="Zona de riesgo" className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4">
              <h2 className="font-black text-red-950">Zona de riesgo</h2>
              <form onSubmit={rename} className="mt-3">
                <FieldLabel htmlFor="rename-patient">Nombre del paciente</FieldLabel>
                <input
                  id="rename-patient"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  required
                  className={fieldClass}
                />
                <button
                  type="submit"
                  disabled={saving || name.trim() === '' || name.trim() === patient.fullName}
                  className="mt-3 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  Guardar nombre
                </button>
              </form>
              <button
                type="button"
                onClick={removePatient}
                disabled={saving}
                className="mt-4 rounded-full bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                Eliminar paciente
              </button>
            </section>
          ) : null}
          </div>
        </>
      ) : null}

      <Toast message={toast} />
    </div>
  )
}
