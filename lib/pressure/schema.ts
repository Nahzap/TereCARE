import { z } from 'zod'
import { pressureError } from './reading'

const localDateTimeSchema = z
  .string('Indica fecha y hora')
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Usa fecha y hora AAAA-MM-DDTHH:mm')

export const pressureBodySchema = z
  .object({
    systolic: z.number('La sistólica debe ser un número').int(),
    diastolic: z.number('La diastólica debe ser un número').int(),
    pulse: z.number().int().nullable().optional(),
    measuredAt: localDateTimeSchema.optional(),
    personId: z.uuid('El cuidador no es válido').optional(),
  })
  .superRefine((value, context) => {
    const message = pressureError(value.systolic, value.diastolic, value.pulse ?? null)
    if (!message) return
    context.addIssue({ code: 'custom', message, path: ['systolic'] })
  })

export type PressureBody = z.output<typeof pressureBodySchema>

export const CAREGIVER_NOTE_PREFIX = 'Cuidador: '

export function caregiverNote(name: string) {
  return `${CAREGIVER_NOTE_PREFIX}${name.trim()}`
}

export function caregiverFromNote(note: string | null | undefined) {
  const text = note?.trim() ?? ''
  if (!text.startsWith(CAREGIVER_NOTE_PREFIX)) return null
  const name = text.slice(CAREGIVER_NOTE_PREFIX.length).trim()
  return name || null
}
