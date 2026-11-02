import { personName } from '@/lib/api/map'
import { APPOINTMENT_STATUSES, type AppointmentStatus } from './ordering'
import type { AppointmentBody } from './schema'

export type Appointment = {
  id: string
  patientId: string
  professionalName: string
  place: string
  startsAt: string
  reason: string
  companion: string
  bring: string
  note: string
  status: AppointmentStatus
  recordedByName: string | null
}

export type AppointmentRow = {
  id: string
  patient_id: string
  professional_name: string
  place: string
  starts_at: string
  reason: string | null
  companion: string | null
  bring: string | null
  note: string | null
  status: string
  profiles: unknown
}

export function mapAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    patientId: row.patient_id,
    professionalName: row.professional_name,
    place: row.place,
    startsAt: row.starts_at,
    reason: row.reason ?? '',
    companion: row.companion ?? '',
    bring: row.bring ?? '',
    note: row.note ?? '',
    status: asStatus(row.status),
    recordedByName: personName(row.profiles),
  }
}

export const APPOINTMENT_COLUMNS =
  'id, patient_id, professional_name, place, starts_at, reason, companion, bring, note, status, profiles(full_name, email)'

export function appointmentWrite(body: AppointmentBody, startsAt: string, recordedBy: string) {
  return {
    professional_name: body.professionalName,
    place: body.place,
    starts_at: startsAt,
    reason: body.reason?.trim() ?? '',
    companion: body.companion?.trim() ?? '',
    bring: body.bring?.trim() ?? '',
    note: body.note?.trim() ?? '',
    status: body.status ?? 'programada',
    recorded_by: recordedBy,
  }
}

function asStatus(value: string): AppointmentStatus {
  if ((APPOINTMENT_STATUSES as readonly string[]).includes(value)) return value as AppointmentStatus
  throw new Error(`Estado de cita desconocido: ${value}`)
}
