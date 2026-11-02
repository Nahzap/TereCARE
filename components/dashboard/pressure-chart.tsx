'use client'

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays } from '@/lib/schedule/dates'
import type { PressurePoint } from '@/lib/timeline/stats'
import { localDateTimeToUtc, utcToLocalDateTime } from '@/lib/time/zoned'
import { AXIS_TICK, ChartCard, dayTick, dayTitle, GRID_STROKE, LegendRow, TooltipBox } from './chart-parts'

const SYSTOLIC = '#b91c1c'
const DIASTOLIC = '#1d4ed8'
const PULSE = '#64748b'
const HIGH_SYSTOLIC = 140
const HIGH_DIASTOLIC = 90

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
}

function dayTicks(from: string, to: string, days: number) {
  const step = Math.max(1, Math.ceil(days / 8))
  const ticks: number[] = []
  for (let day = from; day <= to; day = addDays(day, step)) {
    ticks.push(Date.parse(localDateTimeToUtc(`${day}T00:00`)))
  }
  return ticks
}

export function PressureChart({ points, from, to, days }: { points: PressurePoint[]; from: string; to: string; days: number }) {
  const data = points.map((point) => ({ ...point, t: Date.parse(point.at) }))
  const start = Date.parse(localDateTimeToUtc(`${from}T00:00`))
  const end = Date.parse(localDateTimeToUtc(`${addDays(to, 1)}T00:00`))
  const latest = points[points.length - 1]
  const pulses = points.flatMap((point) => (point.pulse == null ? [] : [point.pulse]))
  const values = points.flatMap((point) => [point.systolic, point.diastolic, ...(point.pulse == null ? [] : [point.pulse])])
  const low = Math.floor(Math.min(60, ...values) / 20) * 20
  const high = Math.ceil(Math.max(HIGH_SYSTOLIC + 20, ...values) / 20) * 20
  const yTicks = Array.from({ length: (high - low) / 20 + 1 }, (_, index) => low + index * 20)
  const compact = days <= 10

  return (
    <ChartCard
      title="Presión arterial"
      headline={
        latest
          ? `Promedio ${average(points.map((p) => p.systolic))}/${average(points.map((p) => p.diastolic))} mmHg · última ${latest.systolic}/${latest.diastolic}`
          : undefined
      }
      empty={points.length === 0 ? 'No hay mediciones de presión en este rango.' : null}
      note={`${points.length === 1 ? '1 medición' : `${points.length} mediciones`}${
        pulses.length ? ` · pulso promedio ${average(pulses)}` : ''
      }. Líneas punteadas: ${HIGH_SYSTOLIC}/${HIGH_DIASTOLIC} mmHg, referencia general de presión alta; no reemplaza la indicación médica.`}
    >
      <LegendRow
        items={[
          { label: 'Sistólica', color: SYSTOLIC },
          { label: 'Diastólica', color: DIASTOLIC },
          { label: 'Pulso (lpm)', color: PULSE, dashed: true },
        ]}
      />
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={GRID_STROKE} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, end]}
              ticks={dayTicks(from, to, days)}
              tick={AXIS_TICK}
              tickFormatter={(t: number) => dayTick(utcToLocalDateTime(new Date(t).toISOString()).date, compact)}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
            />
            <YAxis domain={[low, high]} ticks={yTicks} tick={AXIS_TICK} tickLine={false} axisLine={false} />
            {[
              { y: HIGH_SYSTOLIC, color: SYSTOLIC },
              { y: HIGH_DIASTOLIC, color: DIASTOLIC },
            ].map((line) => (
              <ReferenceLine
                key={line.y}
                y={line.y}
                stroke={line.color}
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{ value: String(line.y), position: 'insideTopRight', fill: line.color, fontSize: 11, fontWeight: 700 }}
              />
            ))}
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined
                if (!active || !row) return null
                const local = utcToLocalDateTime(row.at)
                return (
                  <TooltipBox
                    title={`${dayTitle(local.date)} · ${local.time}`}
                    rows={[
                      { label: 'Sistólica', value: `${row.systolic} mmHg`, color: SYSTOLIC },
                      { label: 'Diastólica', value: `${row.diastolic} mmHg`, color: DIASTOLIC },
                      { label: 'Pulso', value: row.pulse == null ? '—' : `${row.pulse} lpm`, color: PULSE },
                    ]}
                  />
                )
              }}
            />
            <Line dataKey="systolic" name="Sistólica" stroke={SYSTOLIC} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
            <Line dataKey="diastolic" name="Diastólica" stroke={DIASTOLIC} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
            <Line
              dataKey="pulse"
              name="Pulso"
              stroke={PULSE}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={{ r: 2.5, fill: PULSE, strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
