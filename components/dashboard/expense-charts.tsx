'use client'

import Link from 'next/link'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatPesos, type ExpenseStats } from '@/lib/expenses/expense'
import { AXIS_TICK, ChartCard, dayInterval, dayTick, dayTitle, GRID_STROKE, LegendRow, TooltipBox } from './chart-parts'

const PAID = '#0f766e'
const INSTALLING = '#1d4ed8'
const PENDING = '#d97706'
const COVERED = '#64748b'

function pesos(amount: number) {
  return formatPesos(amount)
}

function sliceTotal(row: { paid: number; pending: number; installing: number; covered: number }) {
  return row.paid + row.pending + row.installing + row.covered
}

export function ExpenseDaysChart({ stats, today }: { stats: ExpenseStats; today: string }) {
  const compact = stats.cumulativeDays.length <= 10
  const chartData = stats.cumulativeDays.map((row) => ({ day: row.day, total: row.total, ...row.amounts }))
  const hasLines = stats.buyerLines.some((buyer) => buyer.total > 0)

  return (
    <ChartCard
      title="Gastos acumulados por cuidador"
      headline={
        hasLines
          ? `${pesos(stats.contributedAmount)} anotados · ${stats.buyerLines.length === 1 ? '1 cuidador' : `${stats.buyerLines.length} cuidadores`}`
          : undefined
      }
      empty={!hasLines ? 'No hay gastos anotados en este tramo.' : null}
      note={`Cada línea es el aporte acumulado de un cuidador (todos los tipos). Todavía por pagar: ${pesos(stats.stillOwed)}. Del ${dayTitle(stats.from)} al ${dayTitle(stats.to)}.`}
    >
      <LegendRow items={stats.buyerLines.map((buyer) => ({ label: buyer.label, color: buyer.color }))} />
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
                const rows = stats.buyerLines
                  .map((buyer) => {
                    const point = payload.find((entry) => entry.dataKey === buyer.key)
                    const value = typeof point?.value === 'number' ? point.value : Number(point?.value ?? 0)
                    return { label: buyer.label, value: pesos(value), color: buyer.color, sort: value }
                  })
                  .sort((left, right) => right.sort - left.sort || left.label.localeCompare(right.label, 'es'))
                  .map(({ label: name, value, color }) => ({ label: name, value, color }))
                const total = stats.buyerLines.reduce((sum, buyer) => {
                  const point = payload.find((entry) => entry.dataKey === buyer.key)
                  return sum + (typeof point?.value === 'number' ? point.value : Number(point?.value ?? 0))
                }, 0)
                return (
                  <TooltipBox
                    title={`${dayTitle(day)}${day === today ? ' · hoy' : ''}`}
                    rows={[...rows, { label: 'Total', value: pesos(total) }]}
                  />
                )
              }}
            />
            {stats.buyerLines.map((buyer) => (
              <Line
                key={buyer.key}
                type="monotone"
                dataKey={buyer.key}
                name={buyer.label}
                stroke={buyer.color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

export function ExpenseSplitChart({ stats, patientId }: { stats: ExpenseStats; patientId: string }) {
  const data = [
    ...stats.details.map((detail) => ({ ...detail, total: sliceTotal(detail) })),
    ...stats.buyers.map((buyer) => ({ ...buyer, total: sliceTotal(buyer) })),
  ].filter((row) => row.total > 0)
  const total = data.reduce((sum, row) => sum + row.total, 0)

  return (
    <ChartCard
      title="Gastos por tipo y comprador"
      headline={stats.buyers.length > 0 ? `${stats.buyers.length === 1 ? '1 comprador' : `${stats.buyers.length} compradores`} en este tramo` : undefined}
      empty={total === 0 ? 'No hay gastos en este tramo.' : null}
      note={
        <>
          Entran todos los tipos anotados. El comprador es quien puede cuidar y se registra en{' '}
          <Link href={`/pacientes/${patientId}?seccion=gastos`} className="font-bold text-blue-700 hover:underline">
            Gastos
          </Link>
          .
        </>
      }
    >
      <div className="w-full" style={{ height: Math.max(160, data.length * 42 + 24) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
            <XAxis type="number" tick={AXIS_TICK} tickFormatter={(value: number) => pesos(value)} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={110} tick={AXIS_TICK} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined
                if (!active || !row) return null
                return (
                  <TooltipBox
                    title={row.label}
                    rows={[
                      { label: 'Pagado', value: pesos(row.paid), color: PAID },
                      { label: 'Pagándose', value: pesos(row.installing), color: INSTALLING },
                      { label: 'Pendiente', value: pesos(row.pending), color: PENDING },
                      { label: 'Cubierto', value: pesos(row.covered), color: COVERED },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="paid" name="Pagado" stackId="money" fill={PAID} maxBarSize={22} />
            <Bar dataKey="installing" name="Pagándose" stackId="money" fill={INSTALLING} maxBarSize={22} />
            <Bar dataKey="pending" name="Pendiente" stackId="money" fill={PENDING} maxBarSize={22} />
            <Bar dataKey="covered" name="Cubierto" stackId="money" fill={COVERED} radius={[0, 4, 4, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
