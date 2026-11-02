import { describe, expect, it } from 'vitest'
import { countableDays, dayCare, stayConflict, type CareSituation, type HospitalStay } from './situation'

const home: CareSituation = { dischargedOn: '2026-10-20', hospitalizations: [] }

describe('care days', () => {
  it('counts every day until an alta or a hospitalization exists', () => {
    expect(dayCare(null, '2026-10-01')).toBe('home')
    expect(dayCare({ dischargedOn: null, hospitalizations: [] }, '2026-10-01')).toBe('home')
  })

  it('leaves out the days before the alta and counts the alta itself', () => {
    expect(dayCare(home, '2026-10-19')).toBe('outside')
    expect(dayCare(home, '2026-10-20')).toBe('home')
    expect(countableDays(home, '2026-10-18', '2026-10-21')).toEqual(['2026-10-20', '2026-10-21'])
  })

  it('pauses on hospital days and resumes on the discharge day', () => {
    const situation: CareSituation = {
      dischargedOn: '2026-10-01',
      hospitalizations: [{ id: 'stay', admittedOn: '2026-11-02', dischargedOn: '2026-11-05' }],
    }
    expect(dayCare(situation, '2026-11-01')).toBe('home')
    expect(dayCare(situation, '2026-11-02')).toBe('hospital')
    expect(dayCare(situation, '2026-11-04')).toBe('hospital')
    expect(dayCare(situation, '2026-11-05')).toBe('home')
  })

  it('pauses from an open hospitalization through the following days', () => {
    const situation: CareSituation = {
      dischargedOn: '2026-10-01',
      hospitalizations: [{ id: 'stay', admittedOn: '2026-11-02', dischargedOn: null }],
    }
    expect(dayCare(situation, '2026-11-02')).toBe('hospital')
    expect(dayCare(situation, '2026-11-20')).toBe('hospital')
  })
})

describe('hospital stays', () => {
  const stays: HospitalStay[] = [{ id: 'a', admittedOn: '2026-11-02', dischargedOn: '2026-11-05' }]

  it('rejects an alta before the admission and a second open stay', () => {
    expect(stayConflict(stays, { admittedOn: '2026-11-08', dischargedOn: '2026-11-07' })).toMatch(/anterior/)
    expect(stayConflict([{ id: 'open', admittedOn: '2026-11-02', dischargedOn: null }], { admittedOn: '2026-11-10', dischargedOn: null })).toMatch(
      /sin alta/,
    )
  })

  it('rejects an overlap and allows the next stay to start on the alta', () => {
    expect(stayConflict(stays, { admittedOn: '2026-11-04', dischargedOn: '2026-11-06' })).toMatch(/cruza/)
    expect(stayConflict(stays, { admittedOn: '2026-11-05', dischargedOn: '2026-11-08' })).toBeNull()
    expect(stayConflict(stays, { id: 'a', admittedOn: '2026-11-02', dischargedOn: '2026-11-06' })).toBeNull()
  })
})
