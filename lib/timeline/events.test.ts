import { describe, expect, it } from 'vitest'
import { filterEvents, fixedAdherence, groupEventsByDay, type TimelineEvent } from './events'

function event(partial: Partial<TimelineEvent> & Pick<TimelineEvent, 'id' | 'at' | 'localDate' | 'kind'>): TimelineEvent {
  return { title: partial.id, detail: '', ...partial }
}

describe('timeline', () => {
  it('groups events by day with the newest day first', () => {
    const groups = groupEventsByDay([
      event({ id: 'am', at: '2026-10-28T12:00:00.000Z', localDate: '2026-10-28', kind: 'pressure' }),
      event({ id: 'yesterday', at: '2026-10-27T12:00:00.000Z', localDate: '2026-10-27', kind: 'dose' }),
      event({ id: 'pm', at: '2026-10-28T20:00:00.000Z', localDate: '2026-10-28', kind: 'appointment' }),
    ])
    expect(groups.map((group) => group.day)).toEqual(['2026-10-28', '2026-10-27'])
    expect(groups[0]?.events.map((item) => item.id)).toEqual(['pm', 'am'])
  })

  it('filters one kind without reordering the others away from the helper', () => {
    const events = [
      event({ id: 'p', at: '2026-10-28T12:00:00.000Z', localDate: '2026-10-28', kind: 'pressure' }),
      event({ id: 'd', at: '2026-10-28T13:00:00.000Z', localDate: '2026-10-28', kind: 'dose' }),
    ]
    expect(filterEvents(events, 'dose').map((item) => item.id)).toEqual(['d'])
  })

  it('counts fixed doses across the range and skips sos and expired slots', () => {
    const result = fixedAdherence(
      [
        { id: 'fixed', kind: 'fixed', endDate: null },
        { id: 'sos', kind: 'sos', endDate: null },
        { id: 'ended', kind: 'until', endDate: '2026-10-27' },
      ],
      [{ slotId: 'fixed', takenOn: '2026-10-28' }],
      '2026-10-28',
      '2026-10-29',
    )
    expect(result).toEqual({ done: 1, total: 2 })
  })

  it('keeps a taken dose on the old hour and counts the new hour only when it is still pending', () => {
    const result = fixedAdherence(
      [
        { id: 'old', kind: 'fixed', endDate: null, replacedOn: '2026-10-29', replacesSlotId: null },
        { id: 'next', kind: 'fixed', endDate: null, startsOn: '2026-10-29', replacesSlotId: 'old' },
      ],
      [
        { slotId: 'old', takenOn: '2026-10-28' },
        { slotId: 'old', takenOn: '2026-10-30' },
      ],
      '2026-10-28',
      '2026-10-31',
    )
    expect(result).toEqual({ done: 2, total: 4 })
  })
})
