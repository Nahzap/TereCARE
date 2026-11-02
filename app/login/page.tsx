'use client'

import { GithubLogo, Pill } from '@phosphor-icons/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Provider = 'github' | 'google'

function accountError(message: string) {
  const text = message.toLowerCase()
  if (text.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (text.includes('email not confirmed')) return 'Confirma el correo antes de entrar. Revisa la bandeja y el spam.'
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'Esa cuenta ya existe. Entra con tu contraseña.'
  }
  if (text.includes('password')) return 'La contraseña necesita al menos 6 caracteres.'
  if (text.includes('email')) return 'Ese correo no es válido.'
  return message
}

function authFailureMessage(reason: string | null) {
  if (reason?.toLowerCase().includes('exchange external code')) {
    return 'Google rechazó el secreto. En Google Cloud crea un Client secret nuevo y pégalo en Supabase, en Google → Client Secret, y guarda.'
  }
  if (reason) return reason
  return 'No se pudo iniciar sesión. Intenta de nuevo.'
}

function LoginCard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'create' | 'enter'>('create')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(
    searchParams.get('error') === 'auth' ? authFailureMessage(searchParams.get('reason')) : null,
  )
  const [info, setInfo] = useState<string | null>(null)
  const [pending, setPending] = useState<'account' | Provider | null>(null)

  async function submitAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setInfo(null)
    setPending('account')
    try {
      const supabase = createClient()
      const credentials = { email: email.trim(), password }
      if (mode === 'create') {
        const { data, error } = await supabase.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) {
          setMessage(accountError(error.message))
          return
        }
        if (data.session) {
          router.push('/pacientes')
          return
        }
        setInfo('Cuenta creada. Revisa tu correo, abre el enlace de confirmación y después entra con la misma contraseña.')
        setMode('enter')
        return
      }

      const { error } = await supabase.auth.signInWithPassword(credentials)
      if (error) {
        setMessage(accountError(error.message))
        return
      }
      router.push('/pacientes')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la cuenta')
    } finally {
      setPending(null)
    }
  }

  async function signIn(provider: Provider) {
    setMessage(null)
    setInfo(null)
    setPending(provider)
    try {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (base && key) {
        const settingsResponse = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: key } })
        if (settingsResponse.ok) {
          const settings = (await settingsResponse.json()) as { external?: Record<string, boolean> }
          if (!settings.external?.[provider]) {
            setMessage(
              provider === 'github'
                ? 'GitHub todavía no está activado. Crea la cuenta con tu correo.'
                : 'Google todavía no está activado. Crea la cuenta con tu correo.',
            )
            return
          }
        }
      }

      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) setMessage(accountError(error.message))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo iniciar sesión')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white px-8 py-10 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <Pill size={40} weight="duotone" className="text-blue-700" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">TereCARE</h1>
        <p className="mt-2 text-sm text-slate-600">Esquema de medicamentos para cuidadores</p>
      </div>

      <form onSubmit={submitAccount} className="mt-6 space-y-3">
        <label className="block text-left text-xs font-bold tracking-wide text-slate-600 uppercase" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-700"
        />
        <label className="block text-left text-xs font-bold tracking-wide text-slate-600 uppercase" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-700"
        />
        {message ? <p className="text-sm text-red-700">{message}</p> : null}
        {info ? <p className="text-sm text-emerald-800">{info}</p> : null}
        <button
          type="submit"
          disabled={pending !== null}
          className="w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {pending === 'account' ? 'Un momento…' : mode === 'create' ? 'Crear cuenta' : 'Entrar'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'create' ? 'enter' : 'create')
            setMessage(null)
            setInfo(null)
          }}
          className="w-full text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          {mode === 'create' ? 'Ya tengo cuenta' : 'Crear una cuenta nueva'}
        </button>
      </form>

      <div className="mt-6 border-t border-slate-200 pt-6">
        <button
          type="button"
          onClick={() => signIn('github')}
          disabled={pending !== null}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <GithubLogo size={18} weight="fill" aria-hidden="true" />
          {pending === 'github' ? 'Abriendo GitHub…' : 'Continuar con GitHub'}
        </button>
        <button
          type="button"
          onClick={() => signIn('google')}
          disabled={pending !== null}
          className="mt-3 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          {pending === 'google' ? 'Abriendo Google…' : 'Continuar con Google'}
        </button>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <Suspense
        fallback={
          <div className="w-full max-w-sm rounded-2xl bg-white px-8 py-10 text-center text-sm text-slate-600 shadow-sm">
            Esquema de medicamentos para cuidadores
          </div>
        }
      >
        <LoginCard />
      </Suspense>
    </main>
  )
}
