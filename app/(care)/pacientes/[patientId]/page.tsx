import { Suspense } from 'react'
import { AppointmentsBoard } from '@/components/appointments-board'
import { ExpensesBoard } from '@/components/expenses-board'
import { PatientDashboard } from '@/components/patient-dashboard'
import { PatientSectionNav } from '@/components/patient-section-nav'
import { PressureBoard } from '@/components/pressure-board'
import { ScheduleBoard } from '@/components/schedule-board'
import { parseSection } from '@/lib/patient/section'

type SchedulePageProps = {
  params: Promise<{ patientId: string }>
  searchParams: Promise<{ semana?: string | string[]; seccion?: string | string[] }>
}

export default function PatientSchedulePage({ params, searchParams }: SchedulePageProps) {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm font-medium text-slate-600">Cargando ficha…</p>}>
      <PatientLoader params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function PatientLoader({ params, searchParams }: SchedulePageProps) {
  const { patientId } = await params
  const query = await searchParams
  const rawWeek = Array.isArray(query.semana) ? query.semana[0] : query.semana
  const initialMonday = rawWeek && /^\d{4}-\d{2}-\d{2}$/.test(rawWeek) ? rawWeek : undefined
  const section = parseSection(query.seccion)

  return (
    <PatientSectionNav patientId={patientId} section={section} semana={initialMonday}>
      {section === 'posologia' ? <ScheduleBoard patientId={patientId} initialMonday={initialMonday} /> : null}
      {section === 'presion' ? <PressureBoard patientId={patientId} /> : null}
      {section === 'citas' ? <AppointmentsBoard patientId={patientId} /> : null}
      {section === 'gastos' ? <ExpensesBoard patientId={patientId} /> : null}
      {section === 'dashboard' ? <PatientDashboard patientId={patientId} /> : null}
    </PatientSectionNav>
  )
}
