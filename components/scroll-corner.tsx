'use client'

import { CaretUp } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

export function ScrollCorner() {
  const [atTop, setAtTop] = useState(true)

  useEffect(() => {
    function onScroll() {
      setAtTop(window.scrollY < 8)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function jump() {
    const goingUp = !atTop
    window.scrollTo({ top: goingUp ? 0 : document.documentElement.scrollHeight, behavior: 'smooth' })
    setAtTop(goingUp)
  }

  return (
    <button
      type="button"
      onClick={jump}
      aria-label={atTop ? 'Ir al final de la página' : 'Volver arriba'}
      className="no-print fixed right-4 bottom-4 z-50 flex size-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
    >
      <CaretUp size={22} weight="bold" className={`transition-transform ${atTop ? 'rotate-180' : ''}`} />
    </button>
  )
}
