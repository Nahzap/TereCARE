'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AccessBoard } from '@/components/access-board'

export default function AccesoPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm font-medium text-slate-600">Cargando acceso…</p>}>
      <AccesoLoader />
    </Suspense>
  )
}

function AccesoLoader() {
  const ficha = useSearchParams().get('ficha')
  return <AccessBoard initialFichaId={ficha} />
}
