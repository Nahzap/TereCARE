import { describe, expect, it } from 'vitest'
import { coverageWriteSchema } from './schema'
import {
  applyChanges,
  caregiverColor,
  coverageDateBlock,
  coverageSummary,
  coverageView,
  COVERAGE_WEEK_DAYS,
  daysBetween,
  coveredHourCount,
  dedupeSlots,
  formatHours,
  insideRect,
  canEditCarePerson,
  isAssignableRole,
  isTotalScope,
  joinNames,
  shortNames,
  monthOverlapsHistory,
  percentOf,
  rangeHours,
  readTotals,
  shiftCoverageStart,
  slotKey,
  slotsInRect,
  rectBetween,
  rectChanges,
  coverageDiff,
  totalsLabel,
  totalsRange,
  weekdayShort,
  weekdayTitle,
} from './schedule'

describe('coverage window', () => {
  const today = '2026-10-29'

  it('opens on the recent days and the full planning horizon', () => {
    const window = coverageView(today)
    expect(window.from).toBe('2026-10-14')
    expect(window.to).toBe('2027-01-27')
    expect(window.days).toHaveLength(106)
    expect(window.days[0]).toBe('2026-10-14')
    expect(window.days[15]).toBe(today)
    expect(window.days[105]).toBe('2027-01-27')
  })

  it('labels Thursday 29 October', () => {
    expect(weekdayShort(today)).toBe('JUE')
    expect(weekdayTitle(today)).toBe('Jueves')
  })

  it('slides through history and stops at the planning horizon', () => {
    const january = coverageView(today, '2026-01-01')
    expect(january.from).toBe('2026-01-01')
    expect(january.to).toBe('2026-04-16')
    expect(january.days).toHaveLength(106)

    const november = coverageView(today, '2026-11-01')
    expect(november.from).toBe('2026-11-01')
    expect(november.to).toBe('2027-01-27')
    expect(november.days).toHaveLength(88)

    const januaryNext = coverageView(today, '2027-01-01')
    expect(januaryNext.from).toBe('2027-01-01')
    expect(januaryNext.to).toBe('2027-01-27')
    expect(januaryNext.days).toHaveLength(27)
  })

  it('does not open before the history floor', () => {
    const early = coverageView(today, '2019-06-01')
    expect(early.from).toBe('2022-01-01')
    expect(early.days).toHaveLength(106)
  })

  it('blocks dates outside the history and the planning horizon', () => {
    expect(coverageDateBlock('2026-01-01', today)).toBeNull()
    expect(coverageDateBlock('2027-01-27', today)).toBeNull()
    expect(coverageDateBlock('2027-01-28', today)).toBe('future')
    expect(coverageDateBlock('2021-12-31', today)).toBe('past')
  })

  it('knows which months still belong to the history', () => {
    expect(monthOverlapsHistory(2026, 1, today)).toBe(true)
    expect(monthOverlapsHistory(2026, 12, today)).toBe(true)
    expect(monthOverlapsHistory(2027, 1, today)).toBe(true)
    expect(monthOverlapsHistory(2027, 2, today)).toBe(false)
    expect(monthOverlapsHistory(2021, 12, today)).toBe(false)
  })
})

describe('day slider', () => {
  const today = '2026-10-29'
  const latest = '2027-01-27'

  it('counts one step per day and maps the thumb back to that day', () => {
    expect(daysBetween('2026-10-14', '2026-10-14')).toBe(0)
    expect(daysBetween('2026-10-14', '2026-11-13')).toBe(30)
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)

    const home = coverageView(today).from
    const index = daysBetween('2022-01-01', home)
    expect(shiftCoverageStart('2022-01-01', today, index)).toBe(home)
    expect(shiftCoverageStart('2022-01-01', today, 0)).toBe('2022-01-01')
    expect(shiftCoverageStart('2022-01-01', today, daysBetween('2022-01-01', latest))).toBe(latest)
    expect(shiftCoverageStart('2022-01-01', today, -20)).toBe('2022-01-01')
  })

  it('moves a week with the arrows and stops at both ends', () => {
    expect(COVERAGE_WEEK_DAYS).toBe(7)
    expect(shiftCoverageStart('2026-10-14', today, -COVERAGE_WEEK_DAYS)).toBe('2026-10-07')
    expect(shiftCoverageStart('2026-10-14', today, COVERAGE_WEEK_DAYS)).toBe('2026-10-21')
    expect(shiftCoverageStart('2026-11-10', today, COVERAGE_WEEK_DAYS)).toBe('2026-11-17')
    expect(shiftCoverageStart('2027-01-20', today, COVERAGE_WEEK_DAYS)).toBe(latest)
    expect(shiftCoverageStart(latest, today, COVERAGE_WEEK_DAYS)).toBe(latest)
    expect(shiftCoverageStart('2022-01-03', today, -COVERAGE_WEEK_DAYS)).toBe('2022-01-01')
    expect(shiftCoverageStart('2022-01-01', today, -COVERAGE_WEEK_DAYS)).toBe('2022-01-01')
  })
})

describe('who can be assigned', () => {
  it('lets the owner and caregivers take hours', () => {
    expect(isAssignableRole('owner')).toBe(true)
    expect(isAssignableRole('caregiver')).toBe(true)
    expect(isAssignableRole('viewer')).toBe(false)
  })

  it('lets the owner edit anyone and caregivers only themselves', () => {
    expect(canEditCarePerson('owner', 'me', { userId: 'other' })).toBe(true)
    expect(canEditCarePerson('owner', 'me', { userId: null })).toBe(true)
    expect(canEditCarePerson('caregiver', 'me', { userId: 'me' })).toBe(true)
    expect(canEditCarePerson('caregiver', 'me', { userId: 'other' })).toBe(false)
    expect(canEditCarePerson('caregiver', 'me', { userId: null })).toBe(false)
    expect(canEditCarePerson('viewer', 'me', { userId: 'me' })).toBe(false)
  })
})

describe('hours on the grid', () => {
  it('counts an hour once even if two caregivers share it', () => {
    const slots = [
      { coveredOn: '2026-10-29', hour: 8 },
      { coveredOn: '2026-10-29', hour: 8 },
      { coveredOn: '2026-10-29', hour: 9 },
    ]
    expect(coveredHourCount(slots, ['2026-10-29'])).toBe(2)
    expect(coveredHourCount(slots, ['2026-10-30'])).toBe(0)
  })

  it('drops duplicate hours before saving', () => {
    expect(
      dedupeSlots([
        { coveredOn: '2026-10-29', hour: 8 },
        { coveredOn: '2026-10-29', hour: 8 },
        { coveredOn: '2026-10-29', hour: 9 },
      ]),
    ).toEqual([
      { coveredOn: '2026-10-29', hour: 8 },
      { coveredOn: '2026-10-29', hour: 9 },
    ])
  })

  it('drags a rectangle in any direction', () => {
    const days = ['2026-10-29', '2026-10-30', '2026-10-31']
    const rect = rectBetween({ coveredOn: '2026-10-31', hour: 9 }, { coveredOn: '2026-10-30', hour: 8 })
    expect(rect).toEqual({ fromDay: '2026-10-30', toDay: '2026-10-31', fromHour: 8, toHour: 9 })
    expect(slotsInRect(days, rect)).toEqual([
      { coveredOn: '2026-10-30', hour: 8 },
      { coveredOn: '2026-10-30', hour: 9 },
      { coveredOn: '2026-10-31', hour: 8 },
      { coveredOn: '2026-10-31', hour: 9 },
    ])
    expect(insideRect(rect, '2026-10-30', 9)).toBe(true)
    expect(insideRect(rect, '2026-10-29', 9)).toBe(false)
    expect(insideRect(null, '2026-10-30', 9)).toBe(false)
  })
})

describe('painting a rectangle', () => {
  const cells = [
    { coveredOn: '2026-10-29', hour: 8 },
    { coveredOn: '2026-10-29', hour: 9 },
  ]
  const current = [
    { personId: 'ana', caregiverName: 'Ana', coveredOn: '2026-10-29', hour: 8 },
    { personId: 'bea', caregiverName: 'Bea', coveredOn: '2026-10-29', hour: 8 },
    { personId: 'bea', caregiverName: 'Bea', coveredOn: '2026-10-29', hour: 9 },
    { personId: 'ana', caregiverName: 'Ana', coveredOn: '2026-10-29', hour: 10 },
  ]
  const names = new Map([
    ['ana', 'Ana'],
    ['bea', 'Bea'],
  ])

  it('adds only the hours the person does not have, next to whoever is there', () => {
    const changes = rectChanges(current, cells, { personId: 'ana', mode: 'paint' })
    expect(changes).toEqual([{ personId: 'ana', assigned: true, slots: [{ coveredOn: '2026-10-29', hour: 9 }] }])
    const next = applyChanges(current, changes, names)
    expect(next.filter((slot) => slot.hour === 9).map((slot) => slot.personId).sort()).toEqual(['ana', 'bea'])
  })

  it('removes one person and leaves the others', () => {
    const changes = rectChanges(current, cells, { personId: 'bea', mode: 'erase' })
    expect(changes).toEqual([{ personId: 'bea', assigned: false, slots: cells }])
    const next = applyChanges(current, changes, names)
    expect(next.map((slot) => `${slot.personId} ${slot.hour}`)).toEqual(['ana 8', 'ana 10'])
  })

  it('clears everyone inside the rectangle and nothing outside', () => {
    const changes = rectChanges(current, cells, { personId: null, mode: 'erase' })
    expect(changes).toHaveLength(2)
    expect(applyChanges(current, changes, names).map((slot) => `${slot.personId} ${slot.hour}`)).toEqual(['ana 10'])
  })

  it('sends nothing when the rectangle changes nothing', () => {
    expect(rectChanges(current, [{ coveredOn: '2026-10-29', hour: 10 }], { personId: 'ana', mode: 'paint' })).toEqual([])
    expect(rectChanges(current, [{ coveredOn: '2026-10-29', hour: 11 }], { personId: null, mode: 'erase' })).toEqual([])
  })

  it('keeps only the difference until the hours are confirmed', () => {
    const saved = [
      { personId: 'pilar', caregiverName: 'Pilar', coveredOn: '2026-10-26', hour: 2 },
      { personId: 'pilar', caregiverName: 'Pilar', coveredOn: '2026-10-26', hour: 3 },
    ]
    const draft = [
      { personId: 'rodrigo', caregiverName: 'Rodrigo', coveredOn: '2026-10-26', hour: 4 },
      { personId: 'pilar', caregiverName: 'Pilar', coveredOn: '2026-10-26', hour: 3 },
      { personId: 'rodrigo', caregiverName: 'Rodrigo', coveredOn: '2026-10-26', hour: 3 },
    ]
    expect(coverageDiff(saved, draft)).toEqual([
      { personId: 'pilar', assigned: false, slots: [{ coveredOn: '2026-10-26', hour: 2 }] },
      {
        personId: 'rodrigo',
        assigned: true,
        slots: [
          { coveredOn: '2026-10-26', hour: 3 },
          { coveredOn: '2026-10-26', hour: 4 },
        ],
      },
    ])
    expect(coverageDiff(saved, [...saved])).toEqual([])
  })
})

describe('coverage copy', () => {
  it('describes an empty, partial, and complete window', () => {
    expect(coverageSummary(0, 744)).toMatch(/Nadie está a cargo/)
    expect(coverageSummary(0, 0)).toMatch(/no entran en el indicador/)
    expect(coverageSummary(743, 744)).toBe('Falta 1 hora sin cuidador. 743 de 744 ya tienen a alguien.')
    expect(coverageSummary(744, 744)).toBe('Toda la ventana tiene un cuidador en cada hora.')
  })

  it('keeps the first name and lengthens it only to tell people apart', () => {
    expect(
      shortNames([
        'Rodrigo Jofré Cerda',
        'Claudia Alejandra Jofré',
        'Pilar Alexandra Cerda Monsalve',
        'Karen Vidal Cerda',
      ]),
    ).toEqual(['Rodrigo', 'Claudia', 'Pilar', 'Karen'])
    expect(shortNames(['María José', 'María Paz', 'Ana'])).toEqual(['María José', 'María Paz', 'Ana'])
    expect(shortNames(['  ', 'Ana'])).toEqual(['Cuidador', 'Ana'])
  })

  it('joins the names shown on a cell', () => {
    expect(joinNames([])).toBe('Nadie a cargo')
    expect(joinNames(['Ana'])).toBe('Ana')
    expect(joinNames(['Ana', 'Bea'])).toBe('Ana y Bea')
    expect(joinNames(['Ana', 'Bea', 'Ciro'])).toBe('Ana, Bea y Ciro')
  })

  it('keeps a stable color for the same position', () => {
    expect(caregiverColor(0)).toBe(caregiverColor(8))
    expect(slotKey('user', '2026-10-29', 8)).toBe('user|2026-10-29|08')
  })
})

describe('hours per caregiver', () => {
  const today = '2026-11-01'
  const home = coverageView(today)

  it('sums over the days in view, the month and year around them, or the whole history', () => {
    expect(isTotalScope('month')).toBe(true)
    expect(isTotalScope('week')).toBe(false)
    expect(totalsRange('window', home)).toEqual({ from: '2026-10-17', to: '2027-01-30' })
    expect(totalsRange('month', home)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(totalsRange('year', home)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(totalsRange('all', home)).toEqual({ from: '2022-01-01', to: '2027-01-30' })
    expect(totalsRange('month', coverageView(today, '2026-03-01'))).toEqual({ from: '2026-04-01', to: '2026-04-30' })
    expect(totalsRange('year', coverageView(today, '2022-01-01'))).toEqual({ from: '2022-01-01', to: '2022-12-31' })
  })

  it('names each period', () => {
    expect(totalsLabel('window', { from: '2026-10-17', to: '2027-01-30' })).toBe('Días a la vista')
    expect(totalsLabel('month', { from: '2026-12-01', to: '2026-12-31' })).toBe('Dic 2026')
    expect(totalsLabel('year', { from: '2026-01-01', to: '2026-11-16' })).toBe('2026')
    expect(totalsLabel('all', { from: '2022-01-01', to: '2026-11-16' })).toBe('Todo el historial')
  })

  it('reads the totals and keeps done hours within each person', () => {
    const totals = readTotals(
      {
        people: [
          { personId: 'b', name: 'Bea', hours: 10, doneHours: 4, firstOn: '2026-10-20', lastOn: '2026-11-03' },
          { personId: 'a', name: 'Ana', hours: '30', doneHours: 99, firstOn: '2026-10-18', lastOn: '2026-11-01' },
          { name: 'sin cuenta', hours: 5 },
        ],
        coveredHours: 36,
        sharedHours: 4,
      },
      'window',
      { from: '2026-10-17', to: '2026-11-16' },
    )
    expect(totals.people.map((person) => [person.personId, person.hours, person.doneHours])).toEqual([
      ['a', 30, 30],
      ['b', 10, 4],
    ])
    expect(totals.totalHours).toBe(31 * 24)
    expect(totals.coveredHours).toBe(36)
    expect(totals.sharedHours).toBe(4)
  })

  it('measures the whole history from the first recorded hour', () => {
    const totals = readTotals(
      { people: [{ personId: 'a', name: 'Ana', hours: 24, doneHours: 24, firstOn: '2026-11-01' }], coveredHours: 24 },
      'all',
      { from: '2022-01-01', to: '2026-11-16' },
    )
    expect(totals.from).toBe('2026-11-01')
    expect(totals.totalHours).toBe(16 * 24)
    expect(readTotals({ people: [], coveredHours: 0 }, 'all', { from: '2022-01-01', to: '2026-11-16' }).totalHours).toBe(0)
    expect(
      readTotals(
        { people: [], coveredHours: 12, countableDays: 2, countedFrom: '2026-10-20' },
        'all',
        { from: '2022-01-01', to: '2026-11-16' },
      ),
    ).toMatchObject({ from: '2026-10-20', totalHours: 48, coveredHours: 12 })
  })

  it('writes hours and shares', () => {
    expect(rangeHours('2026-11-01', '2026-11-01')).toBe(24)
    expect(formatHours(1)).toBe('1 hora')
    expect(formatHours(1234)).toBe('1.234 horas')
    expect(percentOf(0, 10)).toBe(0)
    expect(percentOf(1, 1000)).toBe(1)
    expect(percentOf(999, 1000)).toBe(99)
    expect(percentOf(10, 10)).toBe(100)
  })
})

describe('coverage write body', () => {
  const personId = '11111111-1111-4111-8111-111111111111'

  it('accepts a caregiver painted onto a few hours', () => {
    const parsed = coverageWriteSchema.parse({
      personId,
      assigned: true,
      slots: [{ coveredOn: '2026-10-29', hour: 8 }],
    })
    expect(parsed.assigned).toBe(true)
  })

  it('rejects an hour outside the day and an empty drag', () => {
    expect(
      coverageWriteSchema.safeParse({
        personId,
        assigned: true,
        slots: [{ coveredOn: '2026-10-29', hour: 24 }],
      }).success,
    ).toBe(false)
    expect(coverageWriteSchema.safeParse({ personId, assigned: false, slots: [] }).success).toBe(false)
  })
})
