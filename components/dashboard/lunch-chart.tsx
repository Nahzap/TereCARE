'use client'

import { useState, type FormEvent } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  formatLunchRate,
  LUNCH_HOURS_MAX,
  LUNCH_HOURS_MIN,
  LUNCH_RATE_MAX,
  type LunchStats,
} from '@/lib/lunch/lunch'
import { formatPesos } from '@/lib/expenses/expense'
import type { Role } from '@/lib/domain'
import { api, errorText } from '@/components/api'
import { AXIS_TICK, ChartCard, dayInterval, dayTick, dayTitle, GRID_STROKE, LegendRow, TooltipBox } from './chart-parts'

function pesos(amount: number) {
  return formatPesos(amount)
}

export function LunchChart({
  patientId,
  stats,
  today,
  role,
  onRateChange,
}: {
  patientId: string
  stats: LunchStats
  today: string
  role: Role
  onRateChange?: (next: Pick<LunchStats, 'currentRateClp' | 'currentHours'>) => void
}) {
  const canEdit = role === 'owner' || role === 'caregiver'
  const [editing, setEditing] = useState(false)
  const [rateDraft, setRateDraft] = useState(String(stats.currentRateClp))
  const [hoursDraft, setHoursDraft] = useState(String(stats.currentHours))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const compact = stats.cumulativeDays.length <= 10
  const chartData = stats.cumulativeDays.map((row) => ({ day: row.day, total: row.total, ...row.amounts }))
  const hasLines = stats.lines.some((line) => line.amount > 0)

  async function saveRate(event: FormEvent) {
    event.preventDefault()
    const dayRateClp = Number(rateDraft)
    const hoursPerDay = Number(hoursDraft)
    if (!Number.isInteger(dayRateClp) || dayRateClp < 1 || dayRateClp > LUNCH_RATE_MAX) {
      setError('Indica una tarifa entera en pesos')
      return
    }
    if (!Number.isFinite(hoursPerDay) || hoursPerDay < LUNCH_HOURS_MIN || hoursPerDay > LUNCH_HOURS_MAX) {
      setError('Indica las horas del almuerzo (por ejemplo 1.5)')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const next = await api<{ dayRateClp: number; hoursPerDay: number }>(`/api/patients/${patientId}/lunch-rate`, {
        method: 'POST',
        body: JSON.stringify({ dayRateClp, hoursPerDay }),
      })
      onRateChange?.({ currentRateClp: next.dayRateClp, currentHours: next.hoursPerDay })
      setEditing(false)
    } catch (reason) {
      setError(errorText(reason) ?? 'No se pudo guardar la tarifa del almuerzo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ChartCard
      title="Almuerzos valorizados"
      headline={
        hasLines
          ? `${pesos(stats.amount)} · ${stats.days === 1 ? '1 día' : `${stats.days} días`} de almuerzo`
          : undefined
      }
      empty={!hasLines ? 'Todavía no hay almuerzos anotados en este tramo.' : null}
      note={
        <>
          Cada día de almuerzo se valoriza con la tarifa vigente al anotarlo ({formatLunchRate(stats.currentRateClp, stats.currentHours)}{' '}
          ahora). No cuenta como hora de cobertura. Un reajuste aplica solo a almuerzos nuevos. Del {dayTitle(stats.from)}{' '}
          al {dayTitle(stats.to)}.
        </>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <LegendRow items={stats.lines.map((line) => ({ label: line.label, color: line.color }))} />
        {canEdit ? (
          editing ? (
            <form onSubmit={saveRate} className="ml-auto flex flex-wrap items-end gap-2">
              <label className="text-xs font-bold text-slate-700">
                Tarifa día (CLP)
                <input
                  inputMode="numeric"
                  min={1}
                  max={LUNCH_RATE_MAX}
                  step={1}
                  value={rateDraft}
                  onChange={(event) => setRateDraft(event.target.value)}
                  className="mt-1 block w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-semibold"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Horas/día
                <input
                  inputMode="decimal"
                  min={LUNCH_HOURS_MIN}
                  max={LUNCH_HOURS_MAX}
                  step={0.25}
                  value={hoursDraft}
                  onChange={(event) => setHoursDraft(event.target.value)}
                  className="mt-1 block w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-semibold"
                />
              </label>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {saving ? '…' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setRateDraft(String(stats.currentRateClp))
                  setHoursDraft(String(stats.currentHours))
                  setError(null)
                }}
                className="rounded-full px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="ml-auto text-xs font-bold text-blue-700 hover:underline"
            >
              Reajustar almuerzo ({formatLunchRate(stats.currentRateClp, stats.currentHours)})
            </button>
          )
        ) : (
          <p className="ml-auto text-xs font-semibold text-slate-500">
            {formatLunchRate(stats.currentRateClp, stats.currentHours)}
          </p>
        )}
      </div>
      {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
      {hasLines ? (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="day"
                tick={AXIS_TICK}
                tickFormatter={(day: string) => dayTick(day, compact)}
                tickLine={false}
                axisLine={{ stroke: GRID_STROKE }}
                interval={dayInterval(stats.cumulativeDays.length)}
              />
              <YAxis tick={AXIS_TICK} tickFormatter={(value: number) => pesos(value)} tickLine={false} axisLine={false} width={72} />
              <Tooltip
                cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }}
                content={({ active, label, payload }) => {
                  if (!active || !payload?.length) return null
                  const day = String(label ?? '')
                  const rows = stats.lines
                    .map((line) => {
                      const point = payload.find((entry) => entry.dataKey === line.key)
                      const value = typeof point?.value === 'number' ? point.value : Number(point?.value ?? 0)
                      return {
                        label: line.label,
                        value: pesos(value),
                        color: line.color,
                        sort: value,
                      }
                    })
                    .sort((left, right) => right.sort - left.sort || left.label.localeCompare(right.label, 'es'))
                  return (
                    <TooltipBox
                      title={`${dayTitle(day)}${day === today ? ' · hoy' : ''}`}
                      rows={[
                        ...rows.map((row) => ({ label: row.label, value: row.value, color: row.color })),
                        { label: 'Total almuerzos', value: pesos(rows.reduce((sum, row) => sum + row.sort, 0)) },
                      ]}
                    />
                  )
                }}
              />
              {stats.lines.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.label}
                  stroke={line.color}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </ChartCard>
  )
}
