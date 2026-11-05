import Link from 'next/link'
import type { ReactNode } from 'react'
import { PATIENT_SECTIONS, SECTION_LABEL, sectionHref, type PatientSection } from '@/lib/patient/section'

const PILL = 'shrink-0 rounded-full px-4 py-2 text-sm font-bold'

export function PatientSectionNav({
  patientId,
  section,
  semana,
  children,
}: {
  patientId: string
  section: PatientSection | 'acceso' | 'cuidadores'
  semana?: string
  children: ReactNode
}) {
  const items = [
    { key: 'inicio', label: 'Inicio', href: '/pacientes', active: false },
    ...PATIENT_SECTIONS.map((item) => ({
      key: item,
      label: SECTION_LABEL[item],
      href: sectionHref(patientId, item, semana),
      active: item === section,
    })),
    { key: 'acceso', label: 'Acceso', href: sectionHref(patientId, 'acceso'), active: section === 'acceso' },
    {
      key: 'cuidadores',
      label: 'Cuidadores',
      href: `/pacientes/${patientId}/cuidadores`,
      active: section === 'cuidadores',
    },
    { key: 'perfil', label: 'Mi perfil', href: '/perfil', active: false },
  ]

  return (
    <div>
      <div className="no-print sticky top-0 z-40 border-b border-slate-200 bg-slate-100/95 backdrop-blur">
        <nav aria-label="Secciones del paciente" className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-3 py-2">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={`${PILL} ${item.active ? 'bg-blue-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  )
}
