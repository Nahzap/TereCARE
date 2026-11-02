import { formatPesos } from '@/lib/expenses/expense'
import { weekdayShort, weekdayTitle } from '@/lib/coverage/schedule'
import { shortDate } from '@/lib/schedule/dates'
import type { DayGroup, TimelineEvent, TimelineKind } from '@/lib/timeline/events'
import { utcToLocalDateTime } from '@/lib/time/zoned'

type Filter = TimelineKind | 'all'

const KIND_LABEL: Record<TimelineKind, string> = {
  dose: 'Toma',
  pressure: 'Presión',
  appointment: 'Cita',
  expense: 'Gasto',
}

const HEAD = 'px-2 py-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase'
const CELL = 'px-2 py-0.5 align-middle text-xs leading-4 text-slate-700'

function eventTime(event: TimelineEvent) {
  if (event.kind === 'expense') return event.time || formatPesos(event.money ?? 0)
  return event.time && /^\d{2}:\d{2}/.test(event.time) ? event.time.slice(0, 5) : utcToLocalDateTime(event.at).time
}

function byClock(events: readonly TimelineEvent[]) {
  const key = (event: TimelineEvent) => (event.kind === 'expense' ? '99:99' : eventTime(event))
  return [...events].sort((left, right) => key(left).localeCompare(key(right)) || left.title.localeCompare(right.title, 'es'))
}

function doseText(event: TimelineEvent) {
  const name = event.medication || event.title
  const amount = event.amount || event.detail
  return amount ? `${name} ${amount}` : name
}

function appointmentText(event: TimelineEvent) {
  return [event.title, event.place, event.statusLabel, event.companion].filter(Boolean).join(' · ')
}

function pressureText(event: TimelineEvent) {
  const value = event.systolic != null && event.diastolic != null ? `${event.systolic}/${event.diastolic}` : event.title
  return event.pulse ? `${value} · ${event.pulse}` : value
}

type Line = { id: string; time: string; kind: TimelineKind; events: TimelineEvent[] }

function linesOf(events: readonly TimelineEvent[]): Line[] {
  const lines: Line[] = []
  for (const event of byClock(events)) {
    const time = eventTime(event)
    const last = lines[lines.length - 1]
    const canJoin = event.kind === 'dose' && last?.kind === 'dose' && last.time === time
    if (canJoin && last) last.events.push(event)
    else lines.push({ id: event.id, time, kind: event.kind, events: [event] })
  }
  return lines
}

function lineText(line: Line) {
  if (line.kind === 'dose') return line.events.map(doseText).join(' · ')
  const event = line.events[0]
  if (!event) return '—'
  if (line.kind === 'pressure') return pressureText(event)
  if (line.kind === 'expense') {
    const state =
      event.payment === 'pendiente'
        ? 'Pendiente'
        : event.payment === 'pagandose'
          ? 'Pagándose'
          : event.payment === 'cubierto'
            ? 'Cubierto'
            : null
    return [state, event.title, event.buyerName].filter(Boolean).join(' · ')
  }
  return appointmentText(event)
}

function kindClass(kind: TimelineKind) {
  if (kind === 'dose') return 'text-emerald-700'
  if (kind === 'pressure') return 'text-rose-700'
  if (kind === 'expense') return 'text-amber-800'
  return 'text-blue-700'
}

function DayTable({ group, filter }: { group: DayGroup; filter: Filter }) {
  const lines = linesOf(group.events)
  const fullDate = `${weekdayTitle(group.day)} ${shortDate(group.day)} ${group.day.slice(0, 4)}`
  const pressure = filter === 'pressure'
  const expenses = filter === 'expense'
  const headings = pressure
    ? ['Hora', 'Sistólica', 'Diastólica', 'Pulso']
    : expenses
      ? ['Monto', 'Registro']
      : filter === 'all'
        ? ['Hora', 'Registro']
        : ['Hora', 'Medicamento']

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label={fullDate}>
      <header className="flex items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50 px-2 py-1">
        <h3 className="text-xs font-black text-slate-800">
          {weekdayShort(group.day)} {shortDate(group.day)}
        </h3>
        <span className="text-[10px] font-semibold text-slate-400">{group.events.length}</span>
      </header>
      <table className="w-full border-collapse text-left">
        <thead className={pressure ? 'border-b border-slate-100' : 'sr-only'}>
          <tr>
            {headings.map((heading, index) => (
              <th key={heading} className={`${HEAD} ${pressure && index > 0 ? 'text-right' : 'text-left'}`}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const event = line.events[0]
            return (
              <tr key={line.id} className="border-t border-slate-100 first:border-t-0">
                <td className={`${CELL} font-bold tabular-nums whitespace-nowrap text-slate-500`}>{line.time}</td>
                {pressure && event ? (
                  <>
                    <td className={`${CELL} text-right font-bold tabular-nums text-slate-900`}>{event.systolic ?? '—'}</td>
                    <td className={`${CELL} text-right font-bold tabular-nums text-slate-900`}>{event.diastolic ?? '—'}</td>
                    <td className={`${CELL} text-right font-semibold tabular-nums`}>{event.pulse ?? '—'}</td>
                  </>
                ) : (
                  <td
                    className={`${CELL} ${
                      line.kind === 'expense' && line.events[0]?.payment === 'pendiente' ? 'font-bold text-amber-800' : ''
                    } ${line.kind === 'expense' && line.events[0]?.payment === 'pagandose' ? 'font-bold text-blue-800' : ''}`}
                  >
                    {filter === 'all' && line.kind !== 'dose' ? (
                      <span className={`font-bold ${kindClass(line.kind)}`}>{KIND_LABEL[line.kind]} · </span>
                    ) : null}
                    {lineText(line)}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

export function RecordTable({ groups, filter }: { groups: readonly DayGroup[]; filter: Filter }) {
  if (groups.length === 0) return <p className="text-sm text-slate-600">No hay registros en este rango.</p>
  return (
    <div className="grid items-start gap-2 sm:grid-cols-2">
      {groups.map((group) => (
        <DayTable key={group.day} group={group} filter={filter} />
      ))}
    </div>
  )
}
