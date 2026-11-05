export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

export function passwordError(password: string, label = 'La contraseña') {
  const value = password.trim() === password ? password : password
  if (value.length < PASSWORD_MIN) return `${label} necesita al menos ${PASSWORD_MIN} caracteres.`
  if (value.length > PASSWORD_MAX) return `${label} es demasiado larga.`
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(value) || !/\d/.test(value)) {
    return `${label} debe llevar letras y al menos un número.`
  }
  return null
}

export function accountError(message: string) {
  const text = message.toLowerCase()
  if (text.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (text.includes('email not confirmed')) return 'Confirma el correo antes de entrar. Revisa la bandeja y el spam.'
  if (
    text.includes('already registered') ||
    text.includes('already been registered') ||
    text.includes('user already exists')
  ) {
    return 'Esa cuenta ya existe. Si nunca definiste clave, usa «No tengo contraseña».'
  }
  if (
    text.includes('email logins are disabled') ||
    text.includes('email_provider_disabled') ||
    text.includes('email provider is disabled')
  ) {
    return 'El acceso por correo/contraseña está apagado en Supabase. Activa Authentication → Providers → Email.'
  }
  if (text.includes('signups not allowed') || text.includes('signup is disabled') || text.includes('email signups')) {
    return 'No se pueden crear cuentas nuevas aquí. Si ya tenías acceso, usa «No tengo contraseña».'
  }
  if (text.includes('password')) {
    return `La contraseña necesita al menos ${PASSWORD_MIN} caracteres, con letras y un número.`
  }
  if (text.includes('unable to validate email') || text.includes('invalid email')) {
    return 'Ese correo no es válido.'
  }
  if (text.includes('not invited') || text.includes('no está invitado')) {
    return 'Ese correo no tiene invitación. Pide acceso al dueño de la ficha.'
  }
  return message
}
