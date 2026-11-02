'use client'

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { STATUS_LABEL, type AppointmentStatus } from '@/lib/appointments/ordering'
import { percentOf } from '@/lib/coverage/schedule'
import type { AppointmentCount } from '@/lib/timeline/stats'
import { AXIS_TICK, ChartCard, GRID_STROKE, TooltipBox } from './chart-parts'

const STATUS_COLOR: Record<AppointmentStatus, string> = {
  programada: '#1d4ed8',
  asistio: '#059669',
  no_asistio: '#d97706',
  cancelada: '#94a3b8',
}

export function AppointmentChart({ counts }: { counts: AppointmentCount[] }) {
  const total = counts.reduce((sum, item) => sum + item.count, 0)
  const data = counts.map((item) => ({ ...item, label: STATUS_LABEL[item.status] }))

  return (
    <ChartCard
      title="Citas por estado"
      headline={total > 0 ? `${total === 1 ? '1 cita' : `${total} citas`} en este rango` : undefined}
      empty={total === 0 ? 'No hay citas en este rango.' : null}
    >
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 8 }}>
            <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
            <XAxis
              type="number"
              domain={[0, Math.max(...counts.map((item) => item.count), 1)]}
              allowDecimals={false}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <YAxis type="category" dataKey="label" width={88} tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined
                if (!active || !row) return null
                return (
                  <TooltipBox
                    title={row.label}
                    rows={[{ label: 'Citas', value: `${row.count} (${percentOf(row.count, total)}%)`, color: STATUS_COLOR[row.status] }]}
                  />
                )
              }}
            />
            <Bar dataKey="count" name="Citas" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {data.map((item) => (
                <Cell key={item.status} fill={STATUS_COLOR[item.status]} />
              ))}
              <LabelList dataKey="count" position="right" className="fill-slate-700 text-xs font-bold" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
