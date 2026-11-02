'use client'

import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatPesos, type ExpenseStats } from '@/lib/expenses/expense'
import { AXIS_TICK, ChartCard, dayInterval, dayTick, dayTitle, GRID_STROKE, LegendRow, TooltipBox } from './chart-parts'

const PAID = '#0f766e'
const INSTALLING = '#1d4ed8'
const PENDING = '#d97706'

function pesos(amount: number) {
  return formatPesos(amount)
}

export function ExpenseDaysChart({ stats, today }: { stats: ExpenseStats; today: string }) {
  const windowTotal = stats.paidAmount + stats.pendingAmount + stats.installingAmount
  const compact = stats.days.length <= 10
  return (
    <ChartCard
      title="Gastos por día"
      headline={
        windowTotal > 0
          ? `${pesos(stats.paidAmount)} pagados · ${pesos(stats.installingAmount)} pagándose · ${pesos(stats.pendingAmount)} pendientes`
          : stats.stillOwed > 0
            ? `${pesos(stats.stillOwed)} todavía por pagar`
            : undefined
      }
      empty={windowTotal === 0 ? 'No hay gastos en este tramo.' : null}
      note={`Todavía por pagar, aunque la fecha quede fuera: ${pesos(stats.stillOwed)}. Del ${dayTitle(stats.from)} al ${dayTitle(stats.to)}.`}
    >
      <LegendRow
        items={[
          { label: 'Pagado', color: PAID },
          { label: 'Pagándose', color: INSTALLING },
          { label: 'Pendiente', color: PENDING },
        ]}
      />
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.days} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="day"
              tick={AXIS_TICK}
              tickFormatter={(day: string) => dayTick(day, compact)}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              interval={dayInterval(stats.days.length)}
            />
            <YAxis tick={AXIS_TICK} tickFormatter={(value: number) => pesos(value)} tickLine={false} axisLine={false} width={72} />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as ExpenseStats['days'][number] | undefined
                if (!active || !row) return null
                return (
                  <TooltipBox
                    title={`${dayTitle(row.day)}${row.day === today ? ' · hoy' : ''}`}
                    rows={[
                      { label: 'Pagado', value: pesos(row.paid), color: PAID },
                      { label: 'Pagándose', value: pesos(row.installing), color: INSTALLING },
                      { label: 'Pendiente', value: pesos(row.pending), color: PENDING },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="paid" name="Pagado" stackId="money" fill={PAID} maxBarSize={28} />
            <Bar dataKey="installing" name="Pagándose" stackId="money" fill={INSTALLING} maxBarSize={28} />
            <Bar dataKey="pending" name="Pendiente" stackId="money" fill={PENDING} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

export function ExpenseSplitChart({ stats, patientId }: { stats: ExpenseStats; patientId: string }) {
  const data = [
    ...stats.details.map((detail) => ({ ...detail, total: detail.paid + detail.pending + detail.installing })),
    ...stats.buyers.map((buyer) => ({ ...buyer, total: buyer.paid + buyer.pending + buyer.installing })),
  ].filter((row) => row.total > 0)
  const total = data.reduce((sum, row) => sum + row.total, 0)

  return (
    <ChartCard
      title="Gastos por detalle y comprador"
      headline={stats.buyers.length > 0 ? `${stats.buyers.length === 1 ? '1 comprador' : `${stats.buyers.length} compradores`} en este tramo` : undefined}
      empty={total === 0 ? 'No hay gastos en este tramo.' : null}
      note={
        <>
          El comprador es una persona que puede cuidar. Se anota en{' '}
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
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="paid" name="Pagado" stackId="money" fill={PAID} maxBarSize={22} />
            <Bar dataKey="installing" name="Pagándose" stackId="money" fill={INSTALLING} maxBarSize={22} />
            <Bar dataKey="pending" name="Pendiente" stackId="money" fill={PENDING} radius={[0, 4, 4, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
