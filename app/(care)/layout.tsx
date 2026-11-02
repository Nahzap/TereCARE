import type { ReactNode } from 'react'

export default function CareLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-100 font-sans text-slate-900 scheme-light">{children}</div>
}
