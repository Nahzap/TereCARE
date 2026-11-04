import { z, type ZodError } from 'zod'
import { strengthError } from '@/lib/schedule/strength'

export const slotKindSchema = z.enum(['fixed', 'until', 'sos'], 'El tipo de toma no es válido')

export const hourSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa una hora en formato HH:MM')

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha en formato AAAA-MM-DD')

export const createPatientSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre')
    .max(120, 'El nombre no puede superar 120 caracteres'),
  templateKey: z.enum(['teresa'], 'La plantilla no es válida').nullable().optional(),
})

export const updatePatientSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre')
    .max(120, 'El nombre no puede superar 120 caracteres'),
})

export const slotBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Escribe el nombre científico')
      .max(120, 'El nombre no puede superar 120 caracteres'),
    brandName: z
      .string()
      .trim()
      .max(120, 'El nombre comercial no puede superar 120 caracteres')
      .optional(),
    dose: z
      .string()
      .trim()
      .min(1, 'Escribe el gramaje de cada dosis')
      .max(60, 'El gramaje no puede superar 60 caracteres')
      .refine((value) => strengthError(value) == null, 'El gramaje lleva cantidad y unidad, por ejemplo 500 mg'),
    hour: hourSchema,
    kind: slotKindSchema,
    endDate: isoDateSchema.nullable().optional(),
    note: z
      .string()
      .trim()
      .min(1, 'Escribe la administración y la posología')
      .max(300, 'La administración y la posología no pueden superar 300 caracteres'),
    effectiveOn: isoDateSchema.optional(),
  })
  .refine((slot) => slot.kind !== 'until' || (slot.endDate != null && slot.endDate !== ''), {
    message: 'Indica la fecha de término',
    path: ['endDate'],
  })

export type SlotBodyOutput = z.output<typeof slotBodySchema>

export const doseBodySchema = z.object({
  slotId: z.uuid('El identificador del medicamento no es válido'),
  takenOn: isoDateSchema,
  taken: z.boolean('Indica si la dosis fue tomada'),
})

export function firstZodError(error: ZodError): string {
  return error.issues[0]?.message ?? 'Revisa los datos ingresados'
}
