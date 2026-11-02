'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { ACCESS_CAPABILITY, normalizeAccountQuery, type FichaAccess, type GrantRole } from '@/lib/access/grants'
import type { Role } from '@/lib/domain'
import { api, errorText } from '@/components/api'
import { ROLE_LABEL } from '@/components/format'
import { PatientSectionNav } from '@/components/patient-section-nav'
import { FieldLabel, fieldClass } from '@/components/modal'

type Directory = { fichas: FichaAccess[] }
type AccountHit = { id: string; email: string; fullName: string | null }
type SearchResult = { query: string; hits: AccountHit[] }

export function AccessBoard({ initialFichaId }: { initialFichaId: string | null }) {
  const router = useRouter()
  const [directory, setDirectory] = useState<Directory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [pickedId, setPickedId] = useState<string | null>(initialFichaId)
  const [search, setSearch] = useState('')
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [linkRole, setLinkRole] = useState<Record<string, GrantRole>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api<Directory>('/api/access')
      .then((data) => {
        if (!cancelled) {
          setDirectory(data)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason) ?? 'No se pudo cargar el acceso')
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const fichas = directory?.fichas ?? []
  const selected =
    fichas.find((ficha) => ficha.id === pickedId) ??
    fichas.find((ficha) => ficha.role === 'owner') ??
    fichas[0] ??
    null
  const canManage = selected?.role === 'owner'
  const query = normalizeAccountQuery(search)
  const searchSettled = Boolean(query && searchResult?.query === query)
  const hits = searchSettled && searchResult ? searchResult.hits : []

  useEffect(() => {
    if (!canManage || !query) return
    let cancelled = false
    const handle = setTimeout(() => {
      api<AccountHit[]>(`/api/accounts?q=${encodeURIComponent(query)}`)
        .then((rows) => {
          if (!cancelled) {
            setSearchResult({ query, hits: rows })
            setSearchError(null)
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) setSearchError(errorText(reason) ?? 'No se pudo buscar')
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [canManage, query])

  function choose(id: string) {
    setPickedId(id)
    setSearch('')
    setSearchResult(null)
    setFormError(null)
    router.replace(`/acceso?ficha=${id}`, { scroll: false })
  }

  async function createFicha(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const fullName = String(data.get('fullName') ?? '').trim()
    setBusyId('create')
    setFormError(null)
    try {
      const created = await api<{ id: string }>('/api/patients', {
        method: 'POST',
        body: JSON.stringify({ fullName, templateKey: null }),
      })
      form.reset()
      router.push(`/pacientes/${created.id}?seccion=posologia`)
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo crear la ficha')
    } finally {
      setBusyId(null)
    }
  }

  async function link(account: AccountHit) {
    if (!selected) return
    setBusyId(account.id)
    setFormError(null)
    try {
      await api(`/api/patients/${selected.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: account.id, role: linkRole[account.id] ?? 'viewer' }),
      })
      setReloadToken((value) => value + 1)
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo vincular')
    } finally {
      setBusyId(null)
    }
  }

  async function changeRole(userId: string, role: GrantRole) {
    if (!selected) return
    setBusyId(userId)
    setFormError(null)
    try {
      await api(`/api/patients/${selected.id}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      setReloadToken((value) => value + 1)
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo cambiar el acceso')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(userId: string, label: string) {
    if (!selected) return
    if (!window.confirm(`¿Quitar a ${label} de esta ficha?`)) return
    setBusyId(userId)
    setFormError(null)
    try {
      await api(`/api/patients/${selected.id}/members/${userId}`, { method: 'DELETE' })
      setReloadToken((value) => value + 1)
    } catch (reason) {
      setFormError(errorText(reason) ?? 'No se pudo quitar')
    } finally {
      setBusyId(null)
    }
  }

  const body = (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5">
      <div>
        <h1 className="text-2xl font-black">Acceso</h1>
        <p className="text-sm text-slate-600">
          Cada ficha la abre solo quien el responsable vincula. Solo lectura mira. Cuidador anota.
        </p>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {directory === null && !error ? <p className="text-sm text-slate-500">Cargando fichas…</p> : null}

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <ul data-jump="Fichas" className="grid gap-2">
            {fichas.map((ficha) => (
              <li key={ficha.id}>
                <button
                  type="button"
                  onClick={() => choose(ficha.id)}
                  aria-current={selected?.id === ficha.id ? 'true' : undefined}
                  className={`w-full rounded-2xl border px-3 py-3 text-left ${
                    selected?.id === ficha.id ? 'border-blue-700 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="block font-black">{ficha.fullName}</span>
                  <span className="text-xs font-bold text-slate-500">{ROLE_LABEL[ficha.role]}</span>
                </button>
              </li>
            ))}
          </ul>

          <form data-jump="Nueva ficha" onSubmit={createFicha} className="rounded-2xl border border-slate-200 bg-white p-3">
            <h2 className="font-black">Nueva ficha</h2>
            <p className="mt-1 text-sm text-slate-600">
              Escribe el nombre. Al crear, se abre la posología para agregar, editar o borrar los medicamentos.
            </p>
            <FieldLabel htmlFor="ficha-name">Nombre de la persona</FieldLabel>
            <input
              id="ficha-name"
              name="fullName"
              required
              maxLength={120}
              autoComplete="name"
              placeholder="Por ejemplo, Luis Cerda"
              className={fieldClass}
            />
            <button
              type="submit"
              disabled={busyId === 'create'}
              className="mt-4 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {busyId === 'create' ? 'Creando…' : 'Crear ficha'}
            </button>
          </form>
        </div>

        {selected ? (
          <div className="flex flex-col gap-4">
            <div data-jump={selected.fullName} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-black">{selected.fullName}</h2>
                <Link
                  href={`/pacientes/${selected.id}?seccion=posologia`}
                  className="rounded-full bg-blue-700 px-3 py-1.5 text-sm font-bold text-white"
                >
                  Abrir posología
                </Link>
              </div>
              <p className="mt-1 text-sm text-slate-600">{ACCESS_CAPABILITY[selected.role]}</p>
              <ul className="mt-4 grid gap-2">
                {selected.members.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    canManage={canManage}
                    busy={busyId === member.userId}
                    onRole={(role) => changeRole(member.userId, role)}
                    onRemove={() => remove(member.userId, member.fullName?.trim() || member.email)}
                  />
                ))}
              </ul>
            </div>

            {canManage ? (
              <div data-jump="Buscar cuenta" className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="font-black">Buscar cuenta</h2>
                <p className="text-sm text-slate-600">
                  Nombre o correo de alguien que ya entró. Si todavía no tiene cuenta, invítalo desde Cuidadores.
                </p>
                <FieldLabel htmlFor="account-search">Nombre o correo</FieldLabel>
                <input
                  id="account-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Ana o ana@correo.cl"
                  autoComplete="off"
                  className={fieldClass}
                />
                {searchError ? <p className="mt-3 text-sm font-medium text-red-700">{searchError}</p> : null}
                {searchSettled && hits.length === 0 && !searchError ? (
                  <p className="mt-3 text-sm text-slate-600">Ninguna cuenta coincide.</p>
                ) : null}
                <ul className="mt-3 grid gap-2">
                  {hits.map((account) => {
                    const linked = selected.members.find((member) => member.userId === account.id)
                    return (
                      <li
                        key={account.id}
                        className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-bold">{account.fullName || account.email}</p>
                          {account.fullName ? <p className="text-sm text-slate-500">{account.email}</p> : null}
                        </div>
                        {linked ? (
                          <span className="text-sm font-bold text-slate-600">Ya está: {ROLE_LABEL[linked.role]}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              aria-label={`Acceso para ${account.fullName || account.email}`}
                              value={linkRole[account.id] ?? 'viewer'}
                              onChange={(event) =>
                                setLinkRole((current) => ({
                                  ...current,
                                  [account.id]: event.target.value === 'caregiver' ? 'caregiver' : 'viewer',
                                }))
                              }
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold"
                            >
                              <option value="viewer">Solo lectura</option>
                              <option value="caregiver">Cuidador</option>
                            </select>
                            <button
                              type="button"
                              disabled={busyId === account.id}
                              onClick={() => link(account)}
                              className="rounded-full bg-blue-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                            >
                              Vincular
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Solo el responsable vincula o quita cuentas de esta ficha.</p>
            )}

            {formError ? <p className="text-sm font-medium text-red-700">{formError}</p> : null}
          </div>
        ) : directory ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
            Crea la primera ficha. Después podrás buscar cuentas y darles consulta o registro.
          </p>
        ) : null}
      </div>
    </section>
  )

  if (!selected) {
    return (
      <div>
        <div className="border-b border-slate-200 bg-slate-100 px-4 py-3">
          <Link href="/pacientes" className="text-sm font-semibold text-blue-700 hover:underline">
            Pacientes
          </Link>
        </div>
        {body}
      </div>
    )
  }

  return (
    <PatientSectionNav patientId={selected.id} section="acceso">
      {body}
    </PatientSectionNav>
  )
}

function MemberRow({
  member,
  canManage,
  busy,
  onRole,
  onRemove,
}: {
  member: FichaAccess['members'][number]
  canManage: boolean
  busy: boolean
  onRole: (role: GrantRole) => void
  onRemove: () => void
}) {
  const label = member.fullName?.trim() || member.email
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-bold">{label}</p>
        {member.fullName?.trim() ? <p className="text-sm text-slate-500">{member.email}</p> : null}
        <p className="text-xs text-slate-500">{capability(member.role)}</p>
      </div>
      {canManage && member.role !== 'owner' ? (
        <div className="flex items-center gap-2">
          <select
            aria-label={`Acceso de ${label}`}
            value={member.role}
            disabled={busy}
            onChange={(event) => onRole(event.target.value === 'caregiver' ? 'caregiver' : 'viewer')}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold"
          >
            <option value="viewer">Solo lectura</option>
            <option value="caregiver">Cuidador</option>
          </select>
          <button type="button" onClick={onRemove} disabled={busy} className="text-sm font-bold text-red-700">
            Quitar
          </button>
        </div>
      ) : (
        <span className="text-sm font-bold text-slate-600">{ROLE_LABEL[member.role]}</span>
      )}
    </li>
  )
}

function capability(role: Role) {
  return ACCESS_CAPABILITY[role]
}
