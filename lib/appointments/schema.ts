import { z } from 'zod'
import { APPOINTMENT_STATUSES } from './ordering'

export const appointmentBodySchema = z.object({
  professionalName: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre del profesional')
    .max(120, 'El nombre no puede superar 120 caracteres'),
  place: z.string().trim().min(1, 'Escribe el lugar').max(160, 'El lugar no puede superar 160 caracteres'),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Indica fecha y hora'),
  reason: z.string().trim().max(200, 'El motivo no puede superar 200 caracteres').optional(),
  companion: z.string().trim().max(120, 'El acompañante no puede superar 120 caracteres').optional(),
  bring: z.string().trim().max(200, 'La nota de qué llevar no puede superar 200 caracteres').optional(),
  note: z.string().trim().max(300, 'La nota no puede superar 300 caracteres').optional(),
  status: z.enum(APPOINTMENT_STATUSES, 'El estado de la cita no es válido').optional(),
})

export type AppointmentBody = z.output<typeof appointmentBodySchema>
