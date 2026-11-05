'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { accountError, passwordError, PASSWORD_MIN } from '@/lib/auth/password'
import { createClient } from '@/lib/supabase/client'
import { FieldLabel, fieldClass } from '@/components/modal'

export default function DefinePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (!data.session) {
        setMessage('Abre el enlace del correo de recuperación otra vez. Si expiró, pide uno nuevo en Entrar.')
        return
      }
      setReady(true)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    if (password !== confirm) {
      setMessage('La confirmación no coincide.')
      return
    }
    const strength = passwordError(password)
    if (strength) {
      setMessage(strength)
      return
    }
    setPending(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setMessage(accountError(error.message))
        return
      }
      router.push('/pacientes')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la contraseña')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black">Definir contraseña</h1>
        <p className="mt-2 text-sm text-slate-600">
          Elige la clave con la que entrarás a TereCARE. Mínimo {PASSWORD_MIN} caracteres, con letras y un número.
        </p>
        {message ? <p className="mt-3 text-sm text-red-700">{message}</p> : null}
        {ready ? (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <FieldLabel htmlFor="new-password">Contraseña nueva</FieldLabel>
            <input
              id="new-password"
              type="password"
              required
              minLength={PASSWORD_MIN}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass}
            />
            <FieldLabel htmlFor="confirm-password">Confirmar</FieldLabel>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={PASSWORD_MIN}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={fieldClass}
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-full bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {pending ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-slate-600">Esperando el enlace del correo…</p>
        )}
      </section>
    </main>
  )
}
