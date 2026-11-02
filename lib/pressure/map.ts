import { personName } from '@/lib/api/map'
import type { PressureBody } from './schema'

export type PressureReading = {
  id: string
  patientId: string
  measuredAt: string
  systolic: number
  diastolic: number
  pulse: number | null
  dayPart: 'manana' | 'tarde' | 'otro' | null
  readingOrder: number | null
  note: string
  recordedByName: string | null
}

export type PressureRow = {
  id: string
  patient_id: string
  measured_at: string
  systolic: number
  diastolic: number
  pulse: number | null
  day_part: string | null
  reading_order: number | null
  note: string | null
  profiles: unknown
}

const DAY_PARTS = new Set(['manana', 'tarde', 'otro'])

export function mapPressure(row: PressureRow): PressureReading {
  const dayPart = row.day_part && DAY_PARTS.has(row.day_part) ? (row.day_part as PressureReading['dayPart']) : null
  const readingOrder =
    typeof row.reading_order === 'number' && Number.isInteger(row.reading_order) && row.reading_order >= 1
      ? row.reading_order
      : null
  return {
    id: row.id,
    patientId: row.patient_id,
    measuredAt: row.measured_at,
    systolic: row.systolic,
    diastolic: row.diastolic,
    pulse: row.pulse,
    dayPart,
    readingOrder,
    note: row.note ?? '',
    recordedByName: personName(row.profiles),
  }
}

export function pressureNumbers(body: PressureBody) {
  return {
    systolic: body.systolic,
    diastolic: body.diastolic,
    pulse: body.pulse ?? null,
  }
}

export function pressureWrite(body: PressureBody, measuredAt: string, readingOrder: number, recordedBy: string) {
  return {
    ...pressureNumbers(body),
    measured_at: measuredAt,
    day_part: null,
    reading_order: readingOrder,
    note: '',
    recorded_by: recordedBy,
  }
}
