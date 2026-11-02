'use client'

import { List } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'

const STICKY_OFFSET = 76

function visibleNodes() {
  return [...document.querySelectorAll<HTMLElement>('[data-jump]')].filter((element) => {
    const label = element.dataset.jump?.trim()
    return Boolean(label) && element.getClientRects().length > 0
  })
}

function activeIndex(nodes: readonly HTMLElement[]) {
  let active = 0
  nodes.forEach((element, index) => {
    if (element.getBoundingClientRect().top <= STICKY_OFFSET + 8) active = index
  })
  return active
}

export function SectionJump() {
  const menuId = useId()
  const pathRef = useRef<string | null>(null)
  const [available, setAvailable] = useState(false)
  const [open, setOpen] = useState(false)
  const [labels, setLabels] = useState<string[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    let frame = 0
    function refresh() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const path = `${window.location.pathname}${window.location.search}`
        if (pathRef.current !== null && pathRef.current !== path) setOpen(false)
        pathRef.current = path
        const enough = visibleNodes().length >= 2
        setAvailable(enough)
        if (!enough) setOpen(false)
      })
    }
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && document.getElementById(menuId)?.contains(target)) return
      setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    function onScroll() {
      setActive(activeIndex(visibleNodes()))
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
    }
  }, [open, menuId])

  if (!available) return null

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    const nodes = visibleNodes()
    if (nodes.length < 2) return
    setLabels(nodes.map((element) => element.dataset.jump?.trim() ?? ''))
    setActive(activeIndex(nodes))
    setOpen(true)
  }

  function go(index: number) {
    const element = visibleNodes()[index]
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setOpen(false)
  }

  return (
    <div id={menuId} className="no-print fixed right-4 bottom-20 z-50">
      {open ? (
        <div
          role="menu"
          aria-label="Secciones de esta página"
          className="absolute right-0 bottom-14 max-h-[min(24rem,calc(100vh-8rem))] w-max max-w-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {labels.map((label, index) => (
            <button
              key={`${label}-${index}`}
              type="button"
              role="menuitem"
              aria-current={index === active ? 'true' : undefined}
              onClick={() => go(index)}
              className={`block w-full px-3 py-2 text-left text-sm font-bold ${
                index === active ? 'bg-slate-900 text-white' : 'text-slate-800 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Ir a una sección de esta página"
        onClick={toggle}
        className="flex size-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        <List size={22} weight="bold" />
      </button>
    </div>
  )
}
