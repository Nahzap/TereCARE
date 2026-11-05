'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { passwordError, PASSWORD_MIN } from '@/lib/auth/password'
import type { Me } from '@/lib/domain'
import { api, errorText } from '@/components/api'
import { FieldLabel, fieldClass } from '@/components/modal'
import { createClient } from '@/lib/supabase/client'

export function ProfileBoard() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api<Me>('/api/me')
      .then((profile) => {
        if (cancelled) return
        setMe(profile)
        setFullName(profile.fullName ?? '')
        setPhone(profile.phone ?? '')
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason) ?? 'No se pudo cargar tu perfil')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setSavingProfile(true)
    setProfileMessage(null)
    setError(null)
    try {
      const next = await api<Me>('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: fullName.trim(), phone }),
      })
      setMe(next)
      setFullName(next.fullName ?? '')
      setPhone(next.phone ?? '')
      setProfileMessage('Datos guardados')
    } catch (reason) {
      setError(errorText(reason) ?? 'No se pudieron guardar los datos')
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordMessage(null)
    setError(null)
    if (nextPassword !== confirmPassword) {
      setError('La confirmación no coincide con la contraseña nueva')
      return
    }
    const strength = passwordError(nextPassword, 'La contraseña nueva')
    if (strength) {
      setError(strength)
      return
    }
    setSavingPassword(true)
    try {
      await api('/api/me/password', {
        method: 'POST',
        body: JSON.stringify({
          ...(currentPassword.trim() ? { currentPassword: currentPassword.trim() } : {}),
          nextPassword,
        }),
      })
      setCurrentPassword('')
      setNextPassword('')
      setConfirmPassword('')
      setPasswordMessage(currentPassword.trim() ? 'Contraseña actualizada' : 'Contraseña definida. Ya puedes entrar con correo y clave.')
    } catch (reason) {
      setError(errorText(reason) ?? 'No se pudo cambiar la contraseña')
    } finally {
      setSavingPassword(false)
    }
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Mi perfil</h1>
          <p className="text-sm text-slate-600">
            Tus datos de cuidador y la contraseña de acceso a TereCARE. El correo lo administra el dueño al invitarte.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/pacientes"
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-800 ring-1 ring-slate-200"
          >
            Inicio
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {loading ? <p className="text-sm text-slate-600">Cargando perfil…</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      {me ? (
        <>
          <form onSubmit={saveProfile} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-black">Datos</h2>
            <FieldLabel htmlFor="profile-email">Correo</FieldLabel>
            <input id="profile-email" value={me.email} readOnly className={`${fieldClass} bg-slate-50 text-slate-600`} />
            <FieldLabel htmlFor="profile-name">Nombre</FieldLabel>
            <input
              id="profile-name"
              required
              maxLength={120}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className={fieldClass}
            />
            <FieldLabel htmlFor="profile-phone">Teléfono</FieldLabel>
            <input
              id="profile-phone"
              type="tel"
              maxLength={24}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+56 9 1234 5678"
              className={fieldClass}
            />
            {profileMessage ? <p className="mt-2 text-sm text-emerald-800">{profileMessage}</p> : null}
            <button
              type="submit"
              disabled={savingProfile}
              className="mt-4 rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {savingProfile ? 'Guardando…' : 'Guardar datos'}
            </button>
          </form>

          <form onSubmit={savePassword} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-black">Contraseña</h2>
            <p className="mt-1 text-sm text-slate-600">
              Si nunca tuviste clave, déjala en blanco la actual y define una nueva. Mínimo {PASSWORD_MIN}{' '}
              caracteres, con letras y un número.
            </p>
            <FieldLabel htmlFor="current-password">Contraseña actual (si ya tienes)</FieldLabel>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className={fieldClass}
            />
            <FieldLabel htmlFor="next-password">Contraseña nueva</FieldLabel>
            <input
              id="next-password"
              type="password"
              required
              minLength={PASSWORD_MIN}
              autoComplete="new-password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              className={fieldClass}
            />
            <FieldLabel htmlFor="confirm-password">Confirmar contraseña nueva</FieldLabel>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={PASSWORD_MIN}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={fieldClass}
            />
            {passwordMessage ? <p className="mt-2 text-sm text-emerald-800">{passwordMessage}</p> : null}
            <button
              type="submit"
              disabled={savingPassword}
              className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {savingPassword ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        </>
      ) : null}
    </section>
  )
}
