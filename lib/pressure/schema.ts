import { z } from 'zod'
import { pressureError } from './reading'

export const pressureBodySchema = z
  .object({
    systolic: z.number('La sistólica debe ser un número').int(),
    diastolic: z.number('La diastólica debe ser un número').int(),
    pulse: z.number().int().nullable().optional(),
  })
  .superRefine((value, context) => {
    const message = pressureError(value.systolic, value.diastolic, value.pulse ?? null)
    if (!message) return
    context.addIssue({ code: 'custom', message, path: ['systolic'] })
  })

export type PressureBody = z.output<typeof pressureBodySchema>
