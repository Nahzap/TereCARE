import { z } from 'zod'
import { isoDateSchema } from '@/lib/validation'
import { addDays } from '@/lib/schedule/dates'

export type CareDayKind = 'home' | 'hospital' | 'outside'

export type HospitalStay = {
  id: string
  admittedOn: string
  dischargedOn: string | null
}

export type CareSituation = {
  dischargedOn: string | null
  hospitalizations: HospitalStay[]
}

const OPEN_END = '9999-12-31'

export const dischargeSchema = z.object({
  dischargedOn: isoDateSchema.nullable(),
})

export const staySchema = z.object({
  admittedOn: isoDateSchema,
  dischargedOn: isoDateSchema.nullable(),
})

export type StayInput = z.output<typeof staySchema>

export function hasCareRules(situation: CareSituation | null | undefined) {
  return situation != null && (situation.dischargedOn != null || situation.hospitalizations.length > 0)
}

/** The discharge day itself is at home. A stay covers [admitted, discharged). */
export function dayCare(situation: CareSituation | null | undefined, day: string): CareDayKind {
  if (!hasCareRules(situation) || !situation) return 'home'
  if (situation.dischargedOn && day < situation.dischargedOn) return 'outside'
  for (const stay of situation.hospitalizations) {
    if (day < stay.admittedOn) continue
    if (stay.dischargedOn == null || day < stay.dischargedOn) return 'hospital'
  }
  return 'home'
}

export function countableDays(situation: CareSituation | null | undefined, from: string, to: string) {
  const days: string[] = []
  let cursor = from
  while (cursor <= to && days.length < 5000) {
    if (dayCare(situation, cursor) === 'home') days.push(cursor)
    const next = addDays(cursor, 1)
    if (next <= cursor) break
    cursor = next
  }
  return days
}

function stayEnd(stay: Pick<HospitalStay, 'dischargedOn'>) {
  return stay.dischargedOn ?? OPEN_END
}

export function staysOverlap(
  left: Pick<HospitalStay, 'admittedOn' | 'dischargedOn'>,
  right: Pick<HospitalStay, 'admittedOn' | 'dischargedOn'>,
) {
  return left.admittedOn < stayEnd(right) && right.admittedOn < stayEnd(left)
}

export function stayConflict(stays: readonly HospitalStay[], candidate: StayInput & { id?: string }) {
  if (candidate.dischargedOn && candidate.dischargedOn < candidate.admittedOn) {
    return 'La fecha de alta no puede ser anterior al ingreso.'
  }
  const others = stays.filter((stay) => stay.id !== candidate.id)
  if (candidate.dischargedOn == null && others.some((stay) => stay.dischargedOn == null)) {
    return 'Ya hay una hospitalización sin alta.'
  }
  if (others.some((stay) => staysOverlap(stay, candidate))) return 'Esa hospitalización se cruza con otra.'
  return null
}
