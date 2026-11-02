import { z } from 'zod'
import { COVERAGE_SLOT_LIMIT } from '@/lib/coverage/schedule'
import { isoDateSchema } from '@/lib/validation'

export const coverageWriteSchema = z.object({
  personId: z.uuid('El cuidador no es válido'),
  assigned: z.boolean('Indica si la hora queda asignada'),
  slots: z
    .array(
      z.object({
        coveredOn: isoDateSchema,
        hour: z
          .number('La hora no es válida')
          .int('La hora no es válida')
          .min(0, 'La hora no es válida')
          .max(23, 'La hora no es válida'),
      }),
    )
    .min(1, 'Elige al menos una hora')
    .max(COVERAGE_SLOT_LIMIT, 'Son demasiadas horas de una vez'),
})

export type CoverageWrite = z.output<typeof coverageWriteSchema>
