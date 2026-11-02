'use client'

import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { caregiverColor, formatHours, HOURS_IN_DAY, percentOf } from '@/lib/coverage/schedule'
import type { CoverageStats } from '@/lib/timeline/stats'
import { AXIS_TICK, ChartCard, dayInterval, dayTick, dayTitle, GRID_STROKE, LegendRow, TooltipBox } from './chart-parts'

const COVERED = '#1d4ed8'
const UNCOVERED = '#fecdd3'
const PAUSED = '#e2e8f0'

export function CoverageDaysChart({ coverage, today }: { coverage: CoverageStats; today: string }) {
  const compact = coverage.days.length <= 10
  const paused = coverage.days.some((day) => day.care !== 'home')
  const data = coverage.days.map((day) => ({
    ...day,
    uncovered: day.care === 'home' ? HOURS_IN_DAY - day.covered : 0,
    paused: day.care === 'home' ? 0 : HOURS_IN_DAY,
  }))
  const missing = coverage.totalHours - coverage.coveredHours

  return (
    <ChartCard
      title="Horas con cuidador por día"
      headline={
        coverage.totalHours === 0
          ? paused
            ? 'Estos días no entran en el indicador.'
            : 'Sin horas en este rango'
          : `${formatHours(coverage.coveredHours)} de ${formatHours(coverage.totalHours)} con alguien a cargo (${percentOf(
              coverage.coveredHours,
              coverage.totalHours,
            )}%)`
      }
      note={`${formatHours(missing)} sin cuidador${
        coverage.sharedHours > 0 ? ` · ${formatHours(coverage.sharedHours)} con dos o más personas a la vez` : ''
      }${paused ? ' · los días anteriores al alta y los de hospital no entran' : ''}.`}
    >
      <LegendRow
        items={[
          { label: 'Con cuidador', color: COVERED },
          { label: 'Sin cuidador', color: UNCOVERED },
          ...(paused ? [{ label: 'No entra', color: PAUSED }] : []),
        ]}
      />
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="day"
              tick={AXIS_TICK}
              tickFormatter={(day: string) => dayTick(day, compact)}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              interval={dayInterval(coverage.days.length)}
            />
            <YAxis
              domain={[0, HOURS_IN_DAY]}
              ticks={[0, 6, 12, 18, 24]}
              tickFormatter={(hours: number) => `${hours} h`}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined
                if (!active || !row) return null
                if (row.care !== 'home') {
                  return (
                    <TooltipBox
                      title={`${dayTitle(row.day)}${row.day === today ? ' · hoy' : ''}`}
                      rows={[
                        {
                          label: 'Este día',
                          value:
                            row.care === 'hospital'
                              ? 'Hospitalizada. No entra en el indicador.'
                              : 'Antes del alta. No entra en el indicador.',
                        },
                      ]}
                    />
                  )
                }
                return (
                  <TooltipBox
                    title={`${dayTitle(row.day)}${row.day === today ? ' · hoy' : ''}`}
                    rows={[
                      { label: 'Con cuidador', value: `${row.covered} h`, color: COVERED },
                      { label: 'Sin cuidador', value: `${row.uncovered} h`, color: UNCOVERED },
                      ...(row.shared > 0 ? [{ label: 'Con dos o más', value: `${row.shared} h` }] : []),
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="covered" name="Con cuidador" stackId="hours" fill={COVERED} maxBarSize={36} />
            <Bar dataKey="uncovered" name="Sin cuidador" stackId="hours" fill={UNCOVERED} radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar dataKey="paused" name="No entra" stackId="hours" fill={PAUSED} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

export function CoveragePeopleChart({ coverage, patientId }: { coverage: CoverageStats; patientId: string }) {
  const personHours = coverage.people.reduce((sum, person) => sum + person.hours, 0)
  const data = coverage.people.map((person, index) => ({ ...person, color: caregiverColor(index) }))

  return (
    <ChartCard
      title="Horas por cuidador"
      headline={data.length > 0 ? `${data.length === 1 ? '1 persona' : `${data.length} personas`} con horas a cargo` : undefined}
      empty={data.length === 0 ? 'Nadie tiene horas asignadas en este rango.' : null}
      note={
        <>
          Una hora compartida cuenta para cada persona. Las horas se asignan en{' '}
          <Link href={`/pacientes/${patientId}/cuidadores`} className="font-bold text-blue-700 hover:underline">
            Cuidadores
          </Link>
          .
        </>
      }
    >
      <div className="w-full" style={{ height: Math.max(120, data.length * 48 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, bottom: 0, left: 8 }}>
            <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
            <XAxis
              type="number"
              allowDecimals={false}
              tickFormatter={(hours: number) => `${hours} h`}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <YAxis type="category" dataKey="name" width={120} tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined
                if (!active || !row) return null
                return (
                  <TooltipBox
                    title={row.name}
                    rows={[
                      { label: 'Horas a cargo', value: formatHours(row.hours), color: row.color },
                      { label: 'Del total de horas asignadas', value: `${percentOf(row.hours, personHours)}%` },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="hours" name="Horas" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {data.map((person) => (
                <Cell key={person.personId} fill={person.color} />
              ))}
              <LabelList
                dataKey="hours"
                position="right"
                formatter={(hours) => `${hours} h · ${percentOf(Number(hours), personHours)}%`}
                className="fill-slate-700 text-xs font-bold"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
