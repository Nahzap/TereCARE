import { describe, expect, it } from 'vitest'
import { buildPeople, mergeTargets, personCreateSchema, personMergeSchema, personStatus, personUpdateSchema } from './people'

describe('care people', () => {
  const rows = [
    { id: 'owner', display_name: 'Rodrigo', email: null, user_id: 'u-owner' },
    { id: 'pilar', display_name: ' Pilar ', email: 'pilar@gmail.com', user_id: null },
    { id: 'left', display_name: 'Ana', email: null, user_id: 'u-left' },
    { id: 'viewer', display_name: 'Beto', email: null, user_id: 'u-viewer' },
  ]
  const members = [
    { userId: 'u-owner', email: 'rodrigo@gmail.com', role: 'owner' as const },
    { userId: 'u-viewer', email: 'beto@gmail.com', role: 'viewer' as const },
  ]

  it('can assign people without an account and current caregivers only', () => {
    const people = buildPeople(rows, members)
    expect(people.map((person) => [person.id, person.assignable])).toEqual([
      ['owner', true],
      ['pilar', true],
      ['left', false],
      ['viewer', false],
    ])
    expect(people[0]?.email).toBe('rodrigo@gmail.com')
    expect(people[1]?.name).toBe('Pilar')
  })

  it('describes whether each person already has an account', () => {
    const [owner, pilar, left] = buildPeople(rows, members)
    expect(personStatus(owner!)).toBe('Con cuenta')
    expect(personStatus(pilar!)).toMatch(/se unirá al entrar/)
    expect(personStatus({ userId: null, role: null, email: null })).toBe('Sin cuenta')
    expect(personStatus(left!)).toBe('Ya no tiene acceso')
  })

  it('merges only into someone else who can still take hours', () => {
    const people = buildPeople(rows, members)
    expect(mergeTargets(people, 'pilar').map((person) => person.id)).toEqual(['owner'])
  })

  it('cleans the name and email', () => {
    expect(personCreateSchema.parse({ name: ' Pilar ', email: ' Pilar@Gmail.com ' })).toEqual({
      name: 'Pilar',
      email: 'pilar@gmail.com',
    })
    expect(personCreateSchema.parse({ name: 'Pilar', email: '' }).email).toBe('')
    expect(personCreateSchema.safeParse({ name: ' ' }).success).toBe(false)
    expect(personCreateSchema.safeParse({ name: 'Pilar', email: 'no-es-correo' }).success).toBe(false)
    expect(personUpdateSchema.safeParse({}).success).toBe(false)
    expect(personMergeSchema.safeParse({ targetId: 'x' }).success).toBe(false)
  })
})
