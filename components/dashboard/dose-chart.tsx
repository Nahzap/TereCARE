'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { percentOf } from '@/lib/coverage/schedule'
import type { DayDoses } from '@/lib/timeline/stats'
import { AXIS_TICK, ChartCard, dayInterval, dayTick, dayTitle, GRID_STROKE, LegendRow, TooltipBox } from './chart-parts'

const DONE = '#059669'
const PENDING = '#cbd5e1'
const SOS = '#7c3aed'

export function DoseChart({ doses, today }: { doses: DayDoses[]; today: string }) {
  const done = doses.reduce((sum, day) => sum + day.done, 0)
  const total = doses.reduce((sum, day) => sum + day.total, 0)
  const sos = doses.reduce((sum, day) => sum + day.sos, 0)
  const paused = doses.some((day) => day.care !== 'home')
  const compact = doses.length <= 10
  const data = doses.map((day) => ({ ...day, pending: day.total - day.done }))

  return (
    <ChartCard
      title="Medicamentos por día"
      headline={
        total > 0
          ? `${done} de ${total} tomas fijas (${percentOf(done, total)}%)${sos > 0 ? ` · ${sos} SOS` : ''}`
          : 'Sin tomas fijas en este rango'
      }
      empty={
        total === 0 && sos === 0
          ? paused
            ? 'Estos días no entran: son anteriores al alta o de hospital.'
            : 'No hay medicamentos programados en este rango.'
          : null
      }
      note={`Las tomas de hoy que aún no llegan a su hora cuentan como pendientes.${
        paused ? ' Los días anteriores al alta y los de hospital no entran.' : ''
      }`}
    >
      <LegendRow
        items={[
          { label: 'Tomadas', color: DONE },
          { label: 'Pendientes o sin marcar', color: PENDING },
          { label: 'SOS dadas', color: SOS },
        ]}
      />
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="day"
              tick={AXIS_TICK}
              tickFormatter={(day: string) => dayTick(day, compact)}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              interval={dayInterval(doses.length)}
            />
            <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
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
                          value: row.care === 'hospital' ? 'Hospitalizada. No entra en el indicador.' : 'Antes del alta. No entra en el indicador.',
                        },
                      ]}
                    />
                  )
                }
                return (
                  <TooltipBox
                    title={`${dayTitle(row.day)}${row.day === today ? ' · hoy' : ''}`}
                    rows={[
                      { label: 'Tomadas', value: `${row.done} de ${row.total} (${percentOf(row.done, row.total)}%)`, color: DONE },
                      { label: 'Pendientes o sin marcar', value: String(row.pending), color: PENDING },
                      { label: 'SOS dadas', value: String(row.sos), color: SOS },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="done" name="Tomadas" stackId="fixed" fill={DONE} maxBarSize={36} />
            <Bar dataKey="pending" name="Pendientes" stackId="fixed" fill={PENDING} radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar dataKey="sos" name="SOS" fill={SOS} radius={[4, 4, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
