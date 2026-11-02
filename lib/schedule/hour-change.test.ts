import { describe, expect, it } from 'vitest'
import {
  currentSegment,
  doseState,
  groupHourSegments,
  replacesLookup,
  segmentForDay,
  takenSet,
} from './dose-state'
import { earliestHourDate, planHourChange } from './hour-change'

const today = '2026-10-29'

function plan(overrides: Partial<Parameters<typeof planHourChange>[0]> = {}) {
  return planHourChange({
    previousHour: '22:00',
    nextHour: '21:00',
    today,
    takenToday: false,
    effectiveOn: today,
    startsOn: null,
    endDate: null,
    replacedOn: null,
    createdOn: '2026-10-01',
    ...overrides,
  })
}

describe('hour change', () => {
  it('lets the new hour start today when today is still DAR', () => {
    expect(earliestHourDate(today, false)).toBe('2026-10-29')
    expect(plan()).toEqual({ action: 'split' })
  })

  it('keeps the same hour without splitting', () => {
    expect(plan({ nextHour: '22:00', effectiveOn: '2026-10-01' })).toEqual({ action: 'keep' })
  })

  it('refuses a date before today', () => {
    expect(plan({ effectiveOn: '2026-10-28' })).toEqual({
      action: 'reject',
      message: 'La hora nueva parte en la ingesta de hoy, no en días anteriores.',
    })
  })

  it('starts tomorrow when today is already taken', () => {
    expect(earliestHourDate(today, true)).toBe('2026-10-30')
    expect(plan({ takenToday: true, effectiveOn: today })).toEqual({
      action: 'reject',
      message: 'La ingesta de hoy ya está tomada. La hora nueva puede partir desde mañana.',
    })
    expect(plan({ takenToday: true, effectiveOn: '2026-10-30' })).toEqual({ action: 'split' })
  })

  it('updates in place when this version has no earlier days', () => {
    expect(plan({ createdOn: today })).toEqual({ action: 'update' })
    expect(plan({ startsOn: today, createdOn: '2026-10-01' })).toEqual({ action: 'update' })
  })

  it('accepts a later start and refuses a course that already ended', () => {
    expect(plan({ effectiveOn: '2026-11-02' })).toEqual({ action: 'split' })
    expect(plan({ endDate: '2026-10-28' })).toEqual({
      action: 'reject',
      message: 'Este medicamento ya no tiene ingestas desde esa fecha.',
    })
  })

  it('refuses to move an hour that no longer has pending DAR', () => {
    expect(plan({ replacedOn: today })).toEqual({
      action: 'reject',
      message: 'No quedan DAR pendientes en esta hora. Los tomados se quedan como están.',
    })
  })
})

describe('dose state', () => {
  const previous = {
    id: 'old',
    startsOn: null,
    endDate: null,
    replacedOn: '2026-10-29',
    replacesSlotId: null,
  }
  const next = {
    id: 'next',
    startsOn: '2026-10-29',
    endDate: null,
    replacedOn: null,
    replacesSlotId: 'old',
  }
  const replacesOf = replacesLookup([previous, next])
  const taken = takenSet([
    { slotId: 'old', takenOn: '2026-10-28' },
    { slotId: 'old', takenOn: '2026-10-30' },
  ])

  it('keeps taken doses on the old hour and moves only pending DAR', () => {
    expect(doseState(previous, '2026-10-28', taken, replacesOf)).toBe('taken')
    expect(doseState(previous, '2026-10-27', taken, replacesOf)).toBe('pending')
    expect(doseState(previous, '2026-10-29', taken, replacesOf)).toBe('hidden')
    expect(doseState(previous, '2026-10-30', taken, replacesOf)).toBe('taken')
    expect(doseState(next, '2026-10-28', taken, replacesOf)).toBe('hidden')
    expect(doseState(next, '2026-10-29', taken, replacesOf)).toBe('pending')
    expect(doseState(next, '2026-10-30', taken, replacesOf)).toBe('hidden')
    expect(doseState(next, '2026-10-31', taken, replacesOf)).toBe('pending')
  })

  it('merges a return to the same hour into one row', () => {
    const oldHour = {
      id: 'old',
      hour: '22:00',
      startsOn: null,
      endDate: null,
      replacedOn: '2026-10-29',
      replacesSlotId: null,
    }
    const middle = {
      id: 'mid',
      hour: '21:00',
      startsOn: '2026-10-29',
      endDate: null,
      replacedOn: '2026-11-01',
      replacesSlotId: 'old',
    }
    const returned = {
      id: 'back',
      hour: '22:00',
      startsOn: '2026-11-01',
      endDate: null,
      replacedOn: null,
      replacesSlotId: 'mid',
    }
    const slots = [oldHour, middle, returned]
    const replacesOf = replacesLookup(slots)
    const taken = takenSet([
      { slotId: 'old', takenOn: '2026-10-26' },
      { slotId: 'old', takenOn: '2026-10-27' },
      { slotId: 'old', takenOn: '2026-10-28' },
      { slotId: 'mid', takenOn: '2026-10-29' },
    ])
    const groups = groupHourSegments(slots, replacesOf)
    const at22 = groups.find((group) => group[0]?.hour === '22:00') ?? []
    const at21 = groups.find((group) => group[0]?.hour === '21:00') ?? []

    expect(groups).toHaveLength(2)
    expect(at22.map((slot) => slot.id).sort()).toEqual(['back', 'old'])
    expect(at21.map((slot) => slot.id)).toEqual(['mid'])
    expect(currentSegment(at22, '2026-11-01')?.id).toBe('back')

    const week = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
    expect(week.map((day) => segmentForDay(at22, day, taken, replacesOf)?.id ?? '—')).toEqual([
      'old',
      'old',
      'old',
      '—',
      '—',
      '—',
      'back',
    ])
    expect(week.map((day) => doseState(segmentForDay(at22, day, taken, replacesOf) ?? oldHour, day, taken, replacesOf))).toEqual([
      'taken',
      'taken',
      'taken',
      'hidden',
      'hidden',
      'hidden',
      'pending',
    ])
    expect(segmentForDay(at21, '2026-10-29', taken, replacesOf)?.id).toBe('mid')
    expect(segmentForDay(at21, '2026-11-01', taken, replacesOf)).toBeNull()
  })

  it('hides a dose after the end date', () => {
    expect(
      doseState(
        { id: 'until', endDate: '2026-11-09', startsOn: null, replacedOn: null, replacesSlotId: null },
        '2026-11-10',
        takenSet([]),
        () => null,
      ),
    ).toBe('ended')
  })
})
