export type Role = 'owner' | 'caregiver' | 'viewer'
export type SlotKind = 'fixed' | 'until' | 'sos'

export type SlotDraft = {
  name: string
  brandName: string
  dose: string
  hour: string
  kind: SlotKind
  endDate: string | null
  note: string
}

export type Slot = SlotDraft & {
  id: string
  patientId: string
  startsOn: string | null
  replacedOn: string | null
  replacesSlotId: string | null
}

export type DoseMark = {
  slotId: string
  takenOn: string
  markedByName: string | null
}

export type PatientListItem = {
  id: string
  fullName: string
  templateKey: string | null
  role: Role
  todayFixedDone: number
  todayFixedTotal: number
}

export type PatientDetail = {
  id: string
  fullName: string
  templateKey: string | null
  role: Role
}

export type Member = {
  userId: string
  email: string
  fullName: string | null
  role: Role
}

export type Invite = {
  id: string
  email: string
  role: 'caregiver' | 'viewer'
  createdAt: string
}

export type WeekPayload = {
  patient: PatientDetail
  monday: string
  days: string[]
  slots: Slot[]
  marks: DoseMark[]
}

export type Me = {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
}
