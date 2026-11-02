const WITH_UNIT =
  /\d(?:[.,]\d+)?(?:\s*\/\s*\d(?:[.,]\d+)?)*\s*(?:mg|g|gr|mcg|µg|μg|ug|ml|ui)\b/i

export function strengthError(value: string) {
  const text = value.trim()
  if (!text) return 'Escribe el gramaje de cada dosis'
  if (text.length > 60) return 'El gramaje no puede superar 60 caracteres'
  if (!WITH_UNIT.test(text)) return 'El gramaje lleva cantidad y unidad, por ejemplo 500 mg'
  return null
}
