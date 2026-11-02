export const PATIENT_SECTIONS = ['posologia', 'presion', 'citas', 'gastos', 'dashboard'] as const

export type PatientSection = (typeof PATIENT_SECTIONS)[number]

export const SECTION_LABEL: Record<PatientSection, string> = {
  posologia: 'Posología',
  presion: 'Presión',
  citas: 'Citas',
  gastos: 'Gastos',
  dashboard: 'Dashboard',
}

export function sectionHref(patientId: string, section: PatientSection | 'acceso', semana?: string) {
  if (section === 'acceso') return `/acceso?ficha=${patientId}`
  const params = new URLSearchParams()
  params.set('seccion', section)
  if (section === 'posologia' && semana) params.set('semana', semana)
  return `/pacientes/${patientId}?${params.toString()}`
}

export function parseSection(value: string | string[] | undefined): PatientSection {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw && (PATIENT_SECTIONS as readonly string[]).includes(raw)) return raw as PatientSection
  return 'posologia'
}
