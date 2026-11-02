export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function errorText(error: unknown): string | null {
  if (error instanceof ApiError && error.status === 401) return null
  if (error instanceof Error && error.message.trim()) return error.message
  return 'No se pudo completar la acción'
}

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text()
  if (!text.trim()) return 'No se pudo completar la acción'
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data === 'string' && data.trim()) return data
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>
      for (const key of ['error', 'message', 'detail']) {
        const value = record[key]
        if (typeof value === 'string' && value.trim()) return value
      }
    }
  } catch {
    const trimmed = text.trim()
    if (trimmed && !trimmed.startsWith('<')) return trimmed
  }
  return 'No se pudo completar la acción'
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers,
  })

  if (response.status === 401) {
    // Not a React component: the session died, so the browser must leave the page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- no router outside a component
    window.location.assign('/login')
    throw new ApiError('Sesión expirada', 401)
  }

  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status)
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError('La respuesta del servidor no es válida', response.status)
  }
}
