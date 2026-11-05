'use client'

import { Pill } from '@phosphor-icons/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { accountError, passwordError, PASSWORD_MIN } from '@/lib/auth/password'
import { createClient } from '@/lib/supabase/client'

function LoginCard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/pacientes'
  const [mode, setMode] = useState<'enter' | 'join'>('enter')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(
    searchParams.get('error') === 'auth' ? 'No se pudo completar el acceso. Intenta de nuevo.' : null,
  )
  const [info, setInfo] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function ensureInvited(targetEmail: string) {
    const response = await fetch('/api/auth/invite-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    })
    const payload = (await response.json().catch(() => null)) as { allowed?: boolean; error?: string } | null
    if (!response.ok) {
      throw new Error(payload?.error ?? 'No se pudo verificar la invitación')
    }
    if (!payload?.allowed) {
      throw new Error('Ese correo no tiene invitación. Pide acceso al dueño de la ficha.')
    }
  }

  async function requestPasswordMail() {
    setMessage(null)
    setInfo(null)
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setMessage('Escribe tu correo para enviarte el enlace.')
      return
    }
    setPending(true)
    try {
      await ensureInvited(trimmedEmail)
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=definir-contrasena`,
      })
      if (error) {
        setMessage(accountError(error.message))
        return
      }
      setInfo('Te enviamos un correo para definir o recuperar tu contraseña. Abre el enlace y elige una clave nueva.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo enviar el correo')
    } finally {
      setPending(false)
    }
  }

  async function submitAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setInfo(null)
    const trimmedEmail = email.trim().toLowerCase()
    const strength = passwordError(password)
    if (strength) {
      setMessage(strength)
      return
    }
    setPending(true)
    try {
      const supabase = createClient()
      if (mode === 'join') {
        await ensureInvited(trimmedEmail)
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) {
          const mapped = accountError(error.message)
          const already =
            /already registered|already been registered|user already exists/i.test(error.message)
          if (already) {
            setMode('enter')
            setMessage(
              'Esa cuenta ya existe. Pulsa «No tengo contraseña / olvidé la mía» para definir tu clave por correo.',
            )
            return
          }
          setMessage(mapped)
          return
        }
        if (data.session) {
          router.push(nextPath.startsWith('/') ? nextPath : '/pacientes')
          router.refresh()
          return
        }
        // Usuario ya existía (p. ej. OAuth): Supabase no crea sesión ni error claro.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setMode('enter')
          setMessage(
            'Esa cuenta ya existe. Pulsa «No tengo contraseña / olvidé la mía» para definir tu clave por correo.',
          )
          return
        }
        setInfo('Cuenta creada. Revisa tu correo, confirma el enlace y después entra con la misma contraseña.')
        setMode('enter')
        return
      }

      const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
      if (error) {
        setMessage(accountError(error.message))
        return
      }
      router.push(nextPath.startsWith('/') ? nextPath : '/pacientes')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar el acceso')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white px-8 py-10 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <Pill size={40} weight="duotone" className="text-blue-700" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">TereCARE</h1>
        <p className="mt-2 text-sm text-slate-600">
          Acceso privado. Solo correos invitados por el dueño de la ficha.
        </p>
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
          minLength={PASSWORD_MIN}
          autoComplete={mode === 'join' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-700"
        />
        <p className="text-xs text-slate-500">Mínimo {PASSWORD_MIN} caracteres, con letras y al menos un número.</p>
        {message ? <p className="text-sm text-red-700">{message}</p> : null}
        {info ? <p className="text-sm text-emerald-800">{info}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {pending ? 'Un momento…' : mode === 'join' ? 'Crear acceso con mi invitación' : 'Entrar'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={requestPasswordMail}
          className="w-full text-sm font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-60"
        >
          No tengo contraseña / olvidé la mía
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'join' ? 'enter' : 'join')
            setMessage(null)
            setInfo(null)
          }}
          className="w-full text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          {mode === 'join' ? 'Ya tengo contraseña · volver a Entrar' : 'Me invitaron y es mi primera vez'}
        </button>
        {mode === 'join' ? (
          <p className="text-xs text-slate-500">
            Si antes entrabas con Google u otro método y nunca elegiste clave, no uses este formulario: vuelve a
            Entrar y pulsa «No tengo contraseña».
          </p>
        ) : null}
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <Suspense
        fallback={
          <div className="w-full max-w-sm rounded-2xl bg-white px-8 py-10 text-center text-sm text-slate-600 shadow-sm">
            Acceso privado para cuidadores invitados
          </div>
        }
      >
        <LoginCard />
      </Suspense>
    </main>
  )
}
