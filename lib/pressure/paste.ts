import { addDays, todayISO } from '@/lib/schedule/dates'

export type PastedPressure = {
  systolic: number
  diastolic: number
  pulse: number
  measuredAt: string
  caregiverName: string
}

export type PasteLineResult =
  | { ok: true; line: number; value: PastedPressure }
  | { ok: false; line: number; error: string; raw: string }

const LINE =
  /^(\d{2,3})\s+(\d{2,3})\s+(\d{2,3})\s+(\d{1,2})\/(\d{1,2})\s+(\d{1,2})[.:](\d{2})\s+(.+?)\s*$/u

/** Resolve DD/MM + time to local YYYY-MM-DDTHH:mm using today; never in the future. */
export function resolvePasteDateTime(
  day: number,
  month: number,
  hour: number,
  minute: number,
  today = todayISO(),
) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (hour > 23 || minute > 59) return null
  const year = Number(today.slice(0, 4))
  const pad = (value: number) => String(value).padStart(2, '0')
  let candidate = `${year}-${pad(month)}-${pad(day)}`
  if (candidate > today) candidate = `${year - 1}-${pad(month)}-${pad(day)}`
  if (candidate > today) return null
  return `${candidate}T${pad(hour)}:${pad(minute)}`
}

export function parsePressureLine(raw: string, line: number, today = todayISO()): PasteLineResult {
  const text = raw.trim()
  if (!text) return { ok: false, line, error: 'Línea vacía', raw }
  const match = LINE.exec(text)
  if (!match) {
    return {
      ok: false,
      line,
      error: 'Formato: sistólica diastólica pulso DD/MM HH.mm cuidador',
      raw,
    }
  }
  const systolic = Number(match[1])
  const diastolic = Number(match[2])
  const pulse = Number(match[3])
  const day = Number(match[4])
  const month = Number(match[5])
  const hour = Number(match[6])
  const minute = Number(match[7])
  const caregiverName = (match[8] ?? '').trim()
  if (!caregiverName) return { ok: false, line, error: 'Falta el nombre del cuidador', raw }

  const measuredAt = resolvePasteDateTime(day, month, hour, minute, today)
  if (!measuredAt) return { ok: false, line, error: 'La fecha u hora no es válida', raw }

  return {
    ok: true,
    line,
    value: { systolic, diastolic, pulse, measuredAt, caregiverName },
  }
}

export function parsePressurePaste(text: string, today = todayISO()) {
  const lines = text.split(/\r?\n/)
  const results: PasteLineResult[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ''
    if (!raw.trim()) continue
    results.push(parsePressureLine(raw, index + 1, today))
  }
  return results
}

export function matchCarePersonId(
  name: string,
  people: readonly { id: string; name: string }[],
) {
  const needle = name.trim().toLocaleLowerCase('es')
  const exact = people.find((person) => person.name.trim().toLocaleLowerCase('es') === needle)
  if (exact) return exact.id
  const starts = people.filter((person) =>
    person.name.trim().toLocaleLowerCase('es').startsWith(needle),
  )
  if (starts.length === 1) return starts[0]?.id ?? null
  const includes = people.filter((person) =>
    person.name.trim().toLocaleLowerCase('es').includes(needle),
  )
  if (includes.length === 1) return includes[0]?.id ?? null
  return null
}

/** Earliest allowed local date for a pressure reading (4 years back, same idea as coverage). */
export function pressureHistoryEarliest(today = todayISO()) {
  const year = Number(today.slice(0, 4))
  return `${year - 4}-01-01`
}

export function pressureMeasuredAtBlock(measuredAtLocal: string, today = todayISO()) {
  const date = measuredAtLocal.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'invalid' as const
  if (date < pressureHistoryEarliest(today)) return 'past' as const
  if (date > addDays(today, 1)) return 'future' as const
  return null
}
