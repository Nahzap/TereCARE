import { NextResponse } from 'next/server'
import { groupFichaAccess, MEMBER_COLUMNS, type AccessMemberRow } from '@/lib/access/grants'
import { asRole, context, respond } from '@/lib/api/guard'
import { asRows, embedded } from '@/lib/api/map'
import type { Role } from '@/lib/domain'

type MineRow = {
  patient_id: string
  role: string
  patients: unknown
}

export async function GET() {
  return respond(async () => {
    const session = await context()
    if ('response' in session) return session.response

    const mineResult = await session.supabase
      .from('patient_members')
      .select('patient_id, role, patients(id, full_name)')
      .eq('user_id', session.user.id)
    if (mineResult.error) throw mineResult.error

    const mine = asRows<MineRow>(mineResult.data).flatMap((row) => {
      const patient = embedded<{ id: string; full_name: string }>(row.patients)
      const role = asRole(row.role)
      if (!patient || !role) return []
      return [{ patientId: patient.id, fullName: patient.full_name, role }]
    })

    if (mine.length === 0) return NextResponse.json({ fichas: [] })

    const memberResult = await session.supabase
      .from('patient_members')
      .select(`patient_id, ${MEMBER_COLUMNS}`)
      .in(
        'patient_id',
        mine.map((ficha) => ficha.patientId),
      )
    if (memberResult.error) throw memberResult.error

    return NextResponse.json({
      fichas: groupFichaAccess(mine, asRows<AccessMemberRow>(memberResult.data), requireRoleName),
    })
  })
}

function requireRoleName(value: string): Role {
  const role = asRole(value)
  if (!role) throw new Error('Rol de miembro desconocido')
  return role
}
