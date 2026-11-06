'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Appointment } from '@/lib/appointments/map'
import { addDays, shortDate, todayISO } from '@/lib/schedule/dates'
import { filterEvents, groupEventsByDay, type TimelineEvent, type TimelineKind } from '@/lib/timeline/events'
import type { AppointmentCount, CoverageStats, DayDoses, PressurePoint } from '@/lib/timeline/stats'
import type { ContributionStats } from '@/lib/contributions/equivalent'
import type { ExpenseStats } from '@/lib/expenses/expense'
import type { LunchStats } from '@/lib/lunch/lunch'
import type { Role } from '@/lib/domain'
import { utcToLocalDateTime } from '@/lib/time/zoned'
import { api, errorText } from '@/components/api'
import { AppointmentChart } from '@/components/dashboard/appointment-chart'
import { ChartCard } from '@/components/dashboard/chart-parts'
import { ContributionChart } from '@/components/dashboard/contribution-chart'
import { CoverageDaysChart, CoveragePeopleChart } from '@/components/dashboard/coverage-charts'
import { DoseChart } from '@/components/dashboard/dose-chart'
import { ExpenseDaysChart, ExpenseSplitChart } from '@/components/dashboard/expense-charts'
import { LunchChart } from '@/components/dashboard/lunch-chart'
import { PressureChart } from '@/components/dashboard/pressure-chart'
import { RecordTable } from '@/components/dashboard/record-table'

type Payload = {
  from: string
  to: string
  today: string
  role: Role
  doses: DayDoses[]
  pressure: PressurePoint[]
  appointments: AppointmentCount[]
  coverage: CoverageStats | null
  expenses: ExpenseStats | null
  contributions: ContributionStats | null
  lunches?: LunchStats | null
  nextAppointment: Appointment | null
  events: TimelineEvent[]
}

type Filter = TimelineKind | 'all'

const RANGES = [7, 30, 90] as const

export function PatientDashboard({ patientId }: { patientId: string }) {
  const [days, setDays] = useState<number>(7)
  const [filter, setFilter] = useState<Filter>('all')
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedDays, setLoadedDays] = useState<number | null>(null)
  const loading = loadedDays !== days

  useEffect(() => {
    const today = todayISO()
    const from = addDays(today, -(days - 1))
    let cancelled = false
    api<Payload>(`/api/patients/${patientId}/timeline?from=${from}&to=${today}`)
      .then((data) => {
        if (!cancelled) {
          setPayload(data)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason) ?? 'No se pudo cargar el dashboard')
      })
      .finally(() => {
        if (!cancelled) setLoadedDays(days)
      })
    return () => {
      cancelled = true
    }
  }, [patientId, days])

  const groups = useMemo(() => groupEventsByDay(filterEvents(payload?.events ?? [], filter)), [payload, filter])

  return (
    <section className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Dashboard</h1>
          <p className="text-sm text-slate-600">
            {payload
              ? `Del ${shortDate(payload.from)} ${payload.from.slice(0, 4)} al ${shortDate(payload.to)} ${payload.to.slice(0, 4)}.`
              : 'Medicamentos, presión, citas y horas de cuidado.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Rango del dashboard">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              aria-pressed={days === option}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${days === option ? 'bg-blue-700 text-white' : 'bg-white text-slate-700'}`}
            >
              {option} días
            </button>
          ))}
        </div>
      </header>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {!payload && loading ? <p className="text-sm text-slate-600">Cargando dashboard…</p> : null}
      {payload ? (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {payload.nextAppointment ? (
            <p className="rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white">
              Próxima cita: {payload.nextAppointment.professionalName} · {payload.nextAppointment.place} ·{' '}
              {utcToLocalDateTime(payload.nextAppointment.startsAt).value.replace('T', ' ')}
            </p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <DoseChart doses={payload.doses} today={payload.today} />
            <PressureChart points={payload.pressure} from={payload.from} to={payload.to} days={payload.doses.length} />
            {payload.coverage ? (
              <>
                <CoverageDaysChart coverage={payload.coverage} today={payload.today} />
                <CoveragePeopleChart coverage={payload.coverage} patientId={patientId} />
              </>
            ) : (
              <ChartCard title="Horas de cuidado" empty="El horario de cuidado todavía no está disponible.">
                {null}
              </ChartCard>
            )}
            <AppointmentChart counts={payload.appointments} />
            {payload.expenses ? (
              <ExpenseDaysChart stats={payload.expenses} today={payload.today} />
            ) : (
              <ChartCard title="Gastos" empty="Los gastos todavía no están listos.">
                {null}
              </ChartCard>
            )}
            {payload.contributions ? (
              <ContributionChart
                patientId={patientId}
                stats={payload.contributions}
                today={payload.today}
                role={payload.role}
                onRateChange={(rateClp) =>
                  setPayload((current) =>
                    current?.contributions
                      ? { ...current, contributions: { ...current.contributions, currentRateClp: rateClp } }
                      : current,
                  )
                }
              />
            ) : null}
            {payload.lunches ? (
              <LunchChart
                patientId={patientId}
                stats={payload.lunches}
                today={payload.today}
                role={payload.role}
                onRateChange={(next) =>
                  setPayload((current) =>
                    current?.lunches
                      ? {
                          ...current,
                          lunches: {
                            ...current.lunches,
                            currentRateClp: next.currentRateClp,
                            currentHours: next.currentHours,
                          },
                        }
                      : current,
                  )
                }
              />
            ) : (
              <ChartCard title="Almuerzos valorizados" empty="Los almuerzos todavía no están listos.">
                {null}
              </ChartCard>
            )}
            {payload.expenses ? <ExpenseSplitChart stats={payload.expenses} patientId={patientId} /> : null}
          </div>
          <section data-jump="Registro" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="record-heading" className="text-lg font-black">Registro</h2>
              <div className="flex flex-wrap gap-2">
                {(['all', 'dose', 'pressure', 'appointment', 'expense'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFilter(item)}
                    aria-pressed={filter === item}
                    className={`rounded-full px-3 py-1.5 text-sm font-bold ${filter === item ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                  >
                    {item === 'all'
                      ? 'Todo'
                      : item === 'dose'
                        ? 'Medicamentos'
                        : item === 'pressure'
                          ? 'Presión'
                          : item === 'appointment'
                            ? 'Citas'
                            : 'Gastos'}
                  </button>
                ))}
              </div>
            </div>
            <RecordTable groups={groups} filter={filter} />
          </section>
        </div>
      ) : null}
    </section>
  )
}
