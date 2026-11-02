import type { ReactNode } from 'react'
import { weekdayShort } from '@/lib/coverage/schedule'
import { shortDate } from '@/lib/schedule/dates'

export const AXIS_TICK = { fontSize: 12, fill: '#475569' }
export const GRID_STROKE = '#e2e8f0'

export function dayTick(day: string, compact: boolean) {
  return compact ? `${weekdayShort(day)} ${day.slice(8)}` : shortDate(day)
}

export function dayInterval(dayCount: number) {
  return dayCount <= 10 ? 0 : Math.ceil(dayCount / 8) - 1
}

export function dayTitle(day: string) {
  return `${weekdayShort(day)} ${shortDate(day)} ${day.slice(0, 4)}`
}

export function ChartCard({
  title,
  headline,
  note,
  empty,
  children,
}: {
  title: string
  headline?: ReactNode
  note?: ReactNode
  empty?: string | null
  children: ReactNode
}) {
  return (
    <section data-jump={title} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
      <header>
        <h2 className="text-xs font-bold tracking-wide text-slate-500 uppercase">{title}</h2>
        {headline ? <p className="mt-1 text-lg font-black text-slate-900">{headline}</p> : null}
      </header>
      {empty ? (
        <p className="flex min-h-40 items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-sm text-slate-600">
          {empty}
        </p>
      ) : (
        children
      )}
      {note && !empty ? <p className="text-xs text-slate-500">{note}</p> : null}
    </section>
  )
}

export function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-black text-slate-900">{title}</p>
      <ul className="grid gap-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-slate-700">
            {row.color ? <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: row.color }} /> : null}
            <span>{row.label}</span>
            <span className="ml-auto pl-3 font-bold text-slate-900">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LegendRow({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={item.dashed ? 'h-0 w-4 border-t-2 border-dashed' : 'size-2.5 rounded-sm'}
            style={item.dashed ? { borderColor: item.color } : { backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
