'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import type { Invite, Member, PatientDetail } from '@/lib/domain'
import { api, errorText } from '@/components/api'
import { CarePeoplePanel } from '@/components/care-people-panel'
import { CareSituationPanel } from '@/components/care-situation-panel'
import { CoverageBoard } from '@/components/coverage-board'
import { ROLE_LABEL } from '@/components/format'
import { FieldLabel, fieldClass, Modal } from '@/components/modal'
import { Toast, useToast } from '@/components/use-toast'
import { passwordError, PASSWORD_MIN } from '@/lib/auth/password'

type AccessPayload = { members: Member[]; invites: Invite[] }
type PasswordTarget = { email: string; label: string }

export function CaregiversBoard({ patientId }: { patientId: string }) {
  const router = useRouter()
  const { toast, showToast } = useToast()
  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [invitePhone, setInvitePhone] = useState('')
  const [role, setRole] = useState<'caregiver' | 'viewer'>('caregiver')
  const [editingInvite, setEditingInvite] = useState<Invite | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<PasswordTarget | null>(null)
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
      const result = await api<{ phoneSaved?: boolean }>(`/api/patients/${patientId}/invites`, {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          role,
          ...(role === 'caregiver' ? { name: inviteName.trim(), phone: invitePhone.trim() } : {}),
        }),
      })
      setEmail('')
      setInviteName('')
      setInvitePhone('')
      showToast(result.phoneSaved === false ? 'Invitación enviada. El teléfono todavía no está en la base de datos' : 'Invitación enviada')
      setPeopleRevision((value) => value + 1)
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

  async function changeMemberRole(member: Member, nextRole: 'caregiver' | 'viewer') {
    if (member.role === nextRole) return
    setFormError(null)
    setSaving(true)
    try {
      const updated = await api<Member>(`/api/patients/${patientId}/members/${member.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      })
      setMembers((current) => current.map((row) => (row.userId === updated.userId ? updated : row)))
      showToast('Acceso actualizado')
      setPeopleRevision((value) => value + 1)
    } catch (reason) {
      const message = errorText(reason)
      if (message) setFormError(message)
    } finally {
      setSaving(false)
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
            revision={peopleRevision}
            onToast={showToast}
            onChange={() => {
              setPeopleRevision((value) => value + 1)
              setReloadToken((value) => value + 1)
            }}
          />
          <CoverageBoard patientId={patientId} peopleRevision={peopleRevision} careRevision={careRevision} />
          <div className="max-w-2xl">
          <section data-jump="Cuentas con acceso" className="mt-6">
            <h2 className="font-black">Cuentas con acceso</h2>
            <p className="mt-1 text-sm text-slate-600">
              {isOwner
                ? 'Puedes cambiar el rol, definir la contraseña de acceso o quitar a alguien. La clave se la entregas tú (no se envía por correo).'
                : 'Personas con cuenta vinculada a esta ficha.'}
            </p>
          <ul className="mt-2 grid gap-2">
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
                  <div className="flex flex-wrap items-center gap-2">
                    {isOwner && member.role !== 'owner' ? (
                      <>
                        <label className="sr-only" htmlFor={`role-${member.userId}`}>
                          Rol de {member.fullName?.trim() || member.email}
                        </label>
                        <select
                          id={`role-${member.userId}`}
                          value={member.role === 'viewer' ? 'viewer' : 'caregiver'}
                          disabled={saving}
                          onChange={(event) =>
                            changeMemberRole(member, event.target.value === 'viewer' ? 'viewer' : 'caregiver')
                          }
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
                        >
                          <option value="caregiver">Cuidador</option>
                          <option value="viewer">Solo lectura</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setPasswordTarget({
                              email: member.email,
                              label: member.fullName?.trim() || member.email,
                            })
                          }
                          className="rounded-full px-3 py-1.5 text-sm font-bold text-blue-700 hover:bg-blue-50"
                        >
                          Contraseña
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMember(member)}
                          className="rounded-full px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50"
                        >
                          Quitar
                        </button>
                      </>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                        {ROLE_LABEL[member.role]}
                      </span>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
          </section>

          {formError ? (
            <p role="alert" className="mt-4 text-sm font-medium text-red-700">
              {formError}
            </p>
          ) : null}

          {isOwner ? (
            <form data-jump="Invitar" onSubmit={invite} className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-black">Invitar</h2>
              <p className="mt-1 text-sm text-slate-600">
                Solo tú como dueño puedes invitar. Después define su contraseña aquí (botón Contraseña en pendientes o en
                cuentas) y entrégasela; ella entra con Entrar en la app.
              </p>
              {role === 'caregiver' ? (
                <>
                  <FieldLabel htmlFor="invite-name">Nombre</FieldLabel>
                  <input
                    id="invite-name"
                    required
                    maxLength={120}
                    value={inviteName}
                    onChange={(event) => setInviteName(event.target.value)}
                    placeholder="Por ejemplo, Pilar"
                    className={fieldClass}
                  />
                </>
              ) : null}
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
              {role === 'caregiver' ? (
                <>
                  <FieldLabel htmlFor="invite-phone">Teléfono (opcional)</FieldLabel>
                  <input
                    id="invite-phone"
                    type="tel"
                    maxLength={24}
                    value={invitePhone}
                    onChange={(event) => setInvitePhone(event.target.value)}
                    placeholder="+56 9 1234 5678"
                    className={fieldClass}
                  />
                </>
              ) : null}
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
                disabled={saving || (role === 'caregiver' && inviteName.trim() === '')}
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
                        <p className="font-bold">{inviteItem.name || inviteItem.email}</p>
                        <p className="text-sm text-slate-500">
                          {[inviteItem.name ? inviteItem.email : null, inviteItem.phone, ROLE_LABEL[inviteItem.role]]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setPasswordTarget({
                              email: inviteItem.email,
                              label: inviteItem.name || inviteItem.email,
                            })
                          }
                          className="rounded-full px-3 py-1.5 text-sm font-bold text-blue-700 hover:bg-blue-50"
                        >
                          Contraseña
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingInvite(inviteItem)}
                          className="rounded-full px-3 py-1.5 text-sm font-bold text-blue-700 hover:bg-blue-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => removeInvite(inviteItem)}
                          className="rounded-full px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50"
                        >
                          Quitar
                        </button>
                      </div>
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

      {editingInvite ? (
        <EditInvite
          inviteItem={editingInvite}
          saving={saving}
          error={formError}
          onClose={() => {
            setEditingInvite(null)
            setFormError(null)
          }}
          onSave={async (changes) => {
            setSaving(true)
            setFormError(null)
            try {
              const result = await api<{ phoneSaved?: boolean }>(`/api/patients/${patientId}/invites/${editingInvite.id}`, {
                method: 'PATCH',
                body: JSON.stringify(changes),
              })
              setEditingInvite(null)
              showToast(
                result.phoneSaved === false
                  ? 'Invitación actualizada. El teléfono todavía no está en la base de datos'
                  : 'Invitación actualizada',
              )
              setPeopleRevision((value) => value + 1)
              setLoading(true)
              setReloadToken((value) => value + 1)
            } catch (reason) {
              const message = errorText(reason)
              if (message) setFormError(message)
            } finally {
              setSaving(false)
            }
          }}
        />
      ) : null}

      {passwordTarget ? (
        <SetAccessPassword
          target={passwordTarget}
          saving={saving}
          error={formError}
          onClose={() => {
            setPasswordTarget(null)
            setFormError(null)
          }}
          onSave={async (nextPassword) => {
            setSaving(true)
            setFormError(null)
            try {
              const result = await api<{ created?: boolean }>(`/api/patients/${patientId}/access/password`, {
                method: 'POST',
                body: JSON.stringify({ email: passwordTarget.email, nextPassword }),
              })
              setPasswordTarget(null)
              showToast(
                result.created
                  ? 'Cuenta lista. Entrégale la clave para que entre con Entrar.'
                  : 'Contraseña actualizada. Entrégasela para que entre con Entrar.',
              )
            } catch (reason) {
              const message = errorText(reason)
              if (message) setFormError(message)
            } finally {
              setSaving(false)
            }
          }}
        />
      ) : null}

      <Toast message={toast} />
    </div>
  )
}

function SetAccessPassword({
  target,
  saving,
  error,
  onClose,
  onSave,
}: {
  target: PasswordTarget
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (nextPassword: string) => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <Modal title={`Contraseña de ${target.label}`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setLocalError(null)
          if (password !== confirm) {
            setLocalError('La confirmación no coincide')
            return
          }
          const strength = passwordError(password)
          if (strength) {
            setLocalError(strength)
            return
          }
          onSave(password)
        }}
      >
        <p className="text-sm text-slate-600">
          Correo: <span className="font-semibold text-slate-800">{target.email}</span>. Mínimo {PASSWORD_MIN} caracteres,
          con letras y un número. No se envía por correo: pásasela tú.
        </p>
        <FieldLabel htmlFor="owner-set-password">Contraseña</FieldLabel>
        <input
          id="owner-set-password"
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
        />
        <FieldLabel htmlFor="owner-set-password-confirm">Confirmar</FieldLabel>
        <input
          id="owner-set-password-confirm"
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={fieldClass}
        />
        {localError || error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {localError || error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </Modal>
  )
}

function EditInvite({
  inviteItem,
  saving,
  error,
  onClose,
  onSave,
}: {
  inviteItem: Invite
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (changes: { name?: string; email: string; phone?: string }) => void
}) {
  const [name, setName] = useState(inviteItem.name ?? '')
  const [email, setEmail] = useState(inviteItem.email)
  const [phone, setPhone] = useState(inviteItem.phone ?? '')
  const caregiver = inviteItem.role === 'caregiver'

  return (
    <Modal title={inviteItem.name ? `Editar a ${inviteItem.name}` : 'Completar invitación'} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSave({ name: name.trim(), email: email.trim(), phone: phone.trim() })
        }}
      >
        <p className="text-sm text-slate-600">
          El nombre y el teléfono quedan en la persona. Cuando entre con este correo, se une a esta misma ficha.
        </p>
        {caregiver ? (
          <>
            <FieldLabel htmlFor="edit-invite-name">Nombre</FieldLabel>
            <input
              id="edit-invite-name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
            />
          </>
        ) : null}
        <FieldLabel htmlFor="edit-invite-email">Correo</FieldLabel>
        <input
          id="edit-invite-email"
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
        />
        {caregiver ? (
          <>
            <FieldLabel htmlFor="edit-invite-phone">Teléfono (opcional)</FieldLabel>
            <input
              id="edit-invite-phone"
              type="tel"
              maxLength={24}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+56 9 1234 5678"
              className={fieldClass}
            />
          </>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving || email.trim() === '' || (caregiver && name.trim() === '')}
          className="mt-4 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </Modal>
  )
}
