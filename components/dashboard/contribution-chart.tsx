'use client'

import { useState, type FormEvent } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  formatHourRate,
  type ContributionStats,
  HOUR_RATE_MAX,
} from '@/lib/contributions/equivalent'
import { formatHours } from '@/lib/coverage/schedule'
import { formatPesos } from '@/lib/expenses/expense'
import type { Role } from '@/lib/domain'
import { api, errorText } from '@/components/api'
import { AXIS_TICK, ChartCard, dayInterval, dayTick, dayTitle, GRID_STROKE, LegendRow, TooltipBox } from './chart-parts'

function pesos(amount: number) {
  return formatPesos(amount)
}

export function ContributionChart({
  patientId,
  stats,
  today,
  role,
  onRateChange,
}: {
  patientId: string
  stats: ContributionStats
  today: string
  role: Role
  onRateChange?: (next: ContributionStats['currentRateClp']) => void
}) {
  const canEdit = role === 'owner' || role === 'caregiver'
  const [editing, setEditing] = useState(false)
  const [rateDraft, setRateDraft] = useState(String(stats.currentRateClp))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const compact = stats.cumulativeDays.length <= 10
  const chartData = stats.cumulativeDays.map((row) => ({ day: row.day, total: row.total, ...row.amounts }))
  const hasLines = stats.lines.some((line) => line.total > 0)

  async function saveRate(event: FormEvent) {
    event.preventDefault()
    const rateClp = Number(rateDraft)
    if (!Number.isInteger(rateClp) || rateClp < 1 || rateClp > HOUR_RATE_MAX) {
      setError('Indica una tarifa entera en pesos')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const next = await api<{ rateClp: number }>(`/api/patients/${patientId}/hour-rate`, {
        method: 'POST',
        body: JSON.stringify({ rateClp }),
      })
      onRateChange?.(next.rateClp)
      setEditing(false)
    } catch (reason) {
      setError(errorText(reason) ?? 'No se pudo guardar la tarifa')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ChartCard
      title="Aporte total equivalente"
      headline={
        hasLines
          ? `${pesos(stats.equivalentAmount)} · ${pesos(stats.moneyAmount)} en dinero · ${pesos(stats.timeAmount)} en horas`
          : undefined
      }
      empty={!hasLines ? 'Todavía no hay dinero ni horas anotadas en este tramo.' : null}
      note={
        <>
          Cada hora presencial se valoriza con la tarifa vigente al momento de anotarla ({formatHourRate(stats.currentRateClp)}{' '}
          ahora). Un reajuste aplica solo a horas nuevas; no cambia el historial. {formatHours(stats.hours)} valorizadas.
          Del {dayTitle(stats.from)} al {dayTitle(stats.to)}.
        </>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <LegendRow items={stats.lines.map((line) => ({ label: line.label, color: line.color }))} />
        {canEdit ? (
          editing ? (
            <form onSubmit={saveRate} className="ml-auto flex flex-wrap items-end gap-2">
              <label className="text-xs font-bold text-slate-700">
                Tarifa hora (CLP)
                <input
                  inputMode="numeric"
                  min={1}
                  max={HOUR_RATE_MAX}
                  step={1}
                  value={rateDraft}
                  onChange={(event) => setRateDraft(event.target.value)}
                  className="mt-1 block w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-semibold"
                />
              </label>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {saving ? '…' : 'Guardar tarifa'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setRateDraft(String(stats.currentRateClp))
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
              Reajustar tarifa ({formatHourRate(stats.currentRateClp)})
            </button>
          )
        ) : (
          <p className="ml-auto text-xs font-semibold text-slate-500">{formatHourRate(stats.currentRateClp)}</p>
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
                        detail: `${pesos(line.money)} dinero · ${pesos(line.timeValue)} horas`,
                      }
                    })
                    .sort((left, right) => right.sort - left.sort || left.label.localeCompare(right.label, 'es'))
                  return (
                    <TooltipBox
                      title={`${dayTitle(day)}${day === today ? ' · hoy' : ''}`}
                      rows={[
                        ...rows.map((row) => ({ label: row.label, value: row.value, color: row.color })),
                        { label: 'Total equivalente', value: pesos(rows.reduce((sum, row) => sum + row.sort, 0)) },
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
