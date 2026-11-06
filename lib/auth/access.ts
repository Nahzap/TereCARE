import { z } from 'zod'

export const inviteCheckSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Ese correo no es válido')),
})

export const profileBodySchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Escribe tu nombre')
    .max(120, 'El nombre no puede superar 120 caracteres'),
  phone: z.string().max(24, 'El teléfono es demasiado largo').optional(),
})

export const passwordBodySchema = z
  .object({
    currentPassword: z.string().optional(),
    nextPassword: z.string().min(1, 'Escribe la contraseña nueva'),
  })
  .superRefine((body, context) => {
    if (body.currentPassword && body.nextPassword === body.currentPassword) {
      context.addIssue({
        code: 'custom',
        message: 'La contraseña nueva debe ser distinta a la actual',
        path: ['nextPassword'],
      })
    }
  })

export const ownerAccessPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Ese correo no es válido')),
  nextPassword: z.string().min(1, 'Escribe la contraseña'),
})

