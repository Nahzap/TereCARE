'use client'

import { useEffect, useRef, useState } from 'react'

export function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  function showToast(message: string) {
    setToast(message)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 2400)
  }

  return { toast, showToast }
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-[60] max-w-xs rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg"
    >
      {message}
    </div>
  )
}
