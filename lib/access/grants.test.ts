import { describe, expect, it } from 'vitest'
import type { Role } from '@/lib/domain'
import { grantDecision, groupFichaAccess, normalizeAccountQuery, roleChangeDecision } from './grants'

const roles: Record<string, Role> = {
  owner: 'owner',
  caregiver: 'caregiver',
  viewer: 'viewer',
}

describe('account search', () => {
  it('keeps a name or email long enough to look someone up', () => {
    expect(normalizeAccountQuery('  Ana ')).toBe('ana')
    expect(normalizeAccountQuery('ro')).toBe('ro')
  })

  it('refuses a blank lookup so the directory is not listed in full', () => {
    expect(normalizeAccountQuery('')).toBeNull()
    expect(normalizeAccountQuery(' a ')).toBeNull()
  })
})

describe('granting access', () => {
  it('lets the responsible person link someone as record or consult', () => {
    expect(
      grantDecision({
        actorRole: 'owner',
        actorId: 'owner-1',
        targetUserId: 'user-2',
        role: 'viewer',
      }),
    ).toEqual({ role: 'viewer' })
  })

  it('keeps the responsible person from being replaced through a link', () => {
    const self = grantDecision({
      actorRole: 'owner',
      actorId: 'owner-1',
      targetUserId: 'owner-1',
      role: 'caregiver',
    })
    const ownerChange = roleChangeDecision({ actorRole: 'owner', targetRole: 'owner', role: 'viewer' })
    expect('code' in self && self.code).toBe('invalid')
    expect('code' in ownerChange && ownerChange.code).toBe('forbidden')
  })

  it('refuses a consult-only account from handing out access', () => {
    const refused = grantDecision({
      actorRole: 'viewer',
      actorId: 'user-2',
      targetUserId: 'user-3',
      role: 'caregiver',
    })
    expect('code' in refused && refused.code).toBe('forbidden')
  })
})

describe('ficha directory', () => {
  it('groups each account under the ficha it can open', () => {
    const fichas = groupFichaAccess(
      [
        { patientId: 'b', fullName: 'Luis', role: 'owner' },
        { patientId: 'a', fullName: 'Ana', role: 'viewer' },
      ],
      [
        {
          patient_id: 'a',
          user_id: 'u2',
          role: 'viewer',
          profiles: { full_name: 'Bea', email: 'bea@example.com' },
          granter: { full_name: 'Ana', email: 'ana@example.com' },
        },
        {
          patient_id: 'b',
          user_id: 'u1',
          role: 'owner',
          profiles: { full_name: '', email: 'ana@example.com' },
          granter: null,
        },
      ],
      (value) => {
        const role = roles[value]
        if (!role) throw new Error(value)
        return role
      },
    )

    expect(fichas.map((ficha) => ficha.fullName)).toEqual(['Ana', 'Luis'])
    expect(fichas[0]?.members[0]).toMatchObject({
      email: 'bea@example.com',
      role: 'viewer',
      grantedByName: 'Ana',
    })
    expect(fichas[1]?.members[0]?.fullName).toBeNull()
  })
})
