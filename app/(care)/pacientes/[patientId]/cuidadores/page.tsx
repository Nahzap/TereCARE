import { Suspense } from 'react'
import { CaregiversBoard } from '@/components/caregivers-board'
import { PatientSectionNav } from '@/components/patient-section-nav'

type CaregiversPageProps = {
  params: Promise<{ patientId: string }>
}

export default function CuidadoresPage({ params }: CaregiversPageProps) {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm font-medium text-slate-600">Cargando cuidadores…</p>}>
      <CaregiversLoader params={params} />
    </Suspense>
  )
}

async function CaregiversLoader({ params }: CaregiversPageProps) {
  const { patientId } = await params
  return (
    <PatientSectionNav patientId={patientId} section="cuidadores">
      <CaregiversBoard patientId={patientId} />
    </PatientSectionNav>
  )
}
