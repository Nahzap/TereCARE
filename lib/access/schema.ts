import { z } from 'zod'
import { GRANT_ROLES } from './grants'

const grantRoleSchema = z.enum(GRANT_ROLES, 'El acceso solo puede ser de modificación o de consulta')

export const grantBodySchema = z.object({
  userId: z.uuid('Elige una cuenta'),
  role: grantRoleSchema,
})

export const roleBodySchema = z.object({
  role: grantRoleSchema,
})
