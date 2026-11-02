export const APPOINTMENT_STATUSES = ['programada', 'asistio', 'no_asistio', 'cancelada'] as const

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  programada: 'Programada',
  asistio: 'Asistió',
  no_asistio: 'Se perdió',
  cancelada: 'Cancelada',
}

export type AppointmentMoment = {
  id: string
  startsAt: string
  localDate: string
  status: AppointmentStatus
}

export type AppointmentGroups<T extends AppointmentMoment> = {
  next: T | null
  overdue: T[]
  upcoming: T[]
  past: T[]
}

export function groupAppointments<T extends AppointmentMoment>(items: readonly T[], today: string): AppointmentGroups<T> {
  const overdue: T[] = []
  const upcoming: T[] = []
  const past: T[] = []

  for (const item of items) {
    if (item.status === 'programada' && item.localDate < today) overdue.push(item)
    else if (item.status === 'programada') upcoming.push(item)
    else past.push(item)
  }

  overdue.sort(byStart)
  upcoming.sort(byStart)
  past.sort((a, b) => b.startsAt.localeCompare(a.startsAt) || b.id.localeCompare(a.id))

  return {
    next: upcoming[0] ?? null,
    overdue,
    upcoming,
    past,
  }
}

function byStart(a: AppointmentMoment, b: AppointmentMoment) {
  return a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id)
}

export function appointmentDayLabel(localDate: string, today: string) {
  if (localDate === today) return 'hoy'
  return null
}
