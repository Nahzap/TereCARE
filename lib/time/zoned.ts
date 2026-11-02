const DEFAULT_ZONE = 'America/Santiago'

type CivilParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  const value = parts.find((part) => part.type === type)?.value
  if (!value) throw new Error(`Falta ${type} en la fecha`)
  return Number(value)
}

function civilParts(instant: Date, timeZone = DEFAULT_ZONE): CivilParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant)

  return {
    year: readPart(parts, 'year'),
    month: readPart(parts, 'month'),
    day: readPart(parts, 'day'),
    hour: readPart(parts, 'hour'),
    minute: readPart(parts, 'minute'),
  }
}

export function localDateTimeToUtc(local: string, timeZone = DEFAULT_ZONE) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!match) throw new Error('Usa fecha y hora AAAA-MM-DDTHH:mm')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const desired = Date.UTC(year, month - 1, day, hour, minute)
  const guess = new Date(desired)
  const seen = civilParts(guess, timeZone)
  const seenUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute)
  return new Date(guess.getTime() - (seenUtc - desired)).toISOString()
}

export function utcToLocalDateTime(isoUtc: string, timeZone = DEFAULT_ZONE) {
  const parts = civilParts(new Date(isoUtc), timeZone)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  const hour = String(parts.hour).padStart(2, '0')
  const minute = String(parts.minute).padStart(2, '0')
  return {
    date: `${parts.year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    value: `${parts.year}-${month}-${day}T${hour}:${minute}`,
  }
}
