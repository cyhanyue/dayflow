'use client'
import { useEffect, useRef, useState } from 'react'
import { format, parseISO, isSameDay, differenceInMinutes } from 'date-fns'
import { useAppStore } from '@/store/useAppStore'
import { CalendarEvent, Task } from '@/types'
import { Calendar, X, ChevronDown } from 'lucide-react'

const HOUR_HEIGHT = 56
const START_HOUR = 8
const END_HOUR = 20

function timeToY(dt: Date): number {
  const h = dt.getHours() + dt.getMinutes() / 60
  return Math.max(0, (h - START_HOUR) * HOUR_HEIGHT)
}

function durationToHeight(start: Date, end: Date): number {
  return Math.max((differenceInMinutes(end, start) / 60) * HOUR_HEIGHT, 18)
}

function computeOverlapLayout(
  items: Array<{ id: string; start: Date; end: Date }>,
): Map<string, { column: number; totalColumns: number }> {
  const result = new Map<string, { column: number; totalColumns: number }>()
  if (items.length === 0) return result

  const parsed = items.map(e => ({ id: e.id, start: e.start.getTime(), end: e.end.getTime() }))
  const sorted = [...parsed].sort((a, b) => a.start - b.start || b.end - a.end)
  const colEnds: number[] = []
  const columnOf = new Map<string, number>()

  for (const ev of sorted) {
    let col = colEnds.findIndex(end => end <= ev.start)
    if (col === -1) col = colEnds.length
    colEnds[col] = ev.end
    columnOf.set(ev.id, col)
  }

  for (const ev of parsed) {
    const overlapping = parsed.filter(o => o.id !== ev.id && o.start < ev.end && o.end > ev.start)
    if (overlapping.length === 0) {
      result.set(ev.id, { column: 0, totalColumns: 1 })
      continue
    }
    const boundaries = new Set<number>([ev.start])
    for (const o of overlapping) {
      if (o.start > ev.start && o.start < ev.end) boundaries.add(o.start)
      if (o.end > ev.start && o.end < ev.end) boundaries.add(o.end)
    }
    boundaries.add(ev.end)
    const pts = [...boundaries].sort((a, b) => a - b)
    let maxConcurrent = 1
    for (let i = 0; i < pts.length - 1; i++) {
      const mid = (pts[i] + pts[i + 1]) / 2
      const count = parsed.filter(o => o.start <= mid && o.end > mid).length
      maxConcurrent = Math.max(maxConcurrent, count)
    }
    const myCol = columnOf.get(ev.id)!
    result.set(ev.id, { column: myCol, totalColumns: Math.max(maxConcurrent, myCol + 1) })
  }

  return result
}

export default function TodayCalendarPanel() {
  const { tasks } = useAppStore()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [now, setNow] = useState(new Date())
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const today = new Date()

  useEffect(() => {
    const start = new Date(today); start.setHours(0, 0, 0, 0)
    const end = new Date(today); end.setHours(23, 59, 59, 999)
    fetch(`/api/events?start=${start.toISOString()}&end=${end.toISOString()}`)
      .then(r => r.ok ? r.json() : [])
      .then(setEvents)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  // Scroll to current time when panel opens
  useEffect(() => {
    if (open && !minimized && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, timeToY(now) - 80)
    }
  }, [open, minimized])

  const todayTasks = tasks.filter(t =>
    t.timeboxStart && t.timeboxEnd && isSameDay(parseISO(t.timeboxStart), today)
  )

  const allItems = [
    ...events.map(ev => ({ id: ev.id, start: parseISO(ev.startDatetime), end: parseISO(ev.endDatetime) })),
    ...todayTasks.map((t: Task) => ({ id: t.id, start: parseISO(t.timeboxStart!), end: parseISO(t.timeboxEnd!) })),
  ]
  const overlapLayout = computeOverlapLayout(allItems)
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const nowY = timeToY(now)

  return (
    <>
      {/* Trigger button — always visible in bottom-right */}
      <button
        onClick={() => { setOpen(true); setMinimized(false) }}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full shadow-lg transition-all"
        style={{ padding: open && !minimized ? '8px 16px 8px 12px' : 12, background: '#1e293b', color: '#94a3b8' }}
        title="Today's calendar"
      >
        <Calendar size={18} />
        {(!open || minimized) && (
          <span className="text-sm font-medium">Today</span>
        )}
      </button>

      {/* Floating panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-50 rounded-2xl shadow-2xl flex flex-col transition-all"
          style={{
            width: 280,
            height: minimized ? 'auto' : 480,
            background: '#1e293b',
            border: '1px solid #334155',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #334155' }}>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>Today</p>
              <p className="text-sm font-bold leading-tight" style={{ color: '#f1f5f9' }}>
                {format(today, 'EEEE, MMMM d')}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMinimized(m => !m)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: '#94a3b8' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title={minimized ? 'Expand' : 'Minimize'}
              >
                <ChevronDown size={14} className={minimized ? 'rotate-180' : ''} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: '#94a3b8' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Time grid */}
          {!minimized && (
            <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
              <div style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT, position: 'relative', display: 'flex' }}>

                {/* Time labels column */}
                <div style={{ width: 32, flexShrink: 0, position: 'relative' }}>
                  {hours.map(h => (
                    <div key={h} style={{ position: 'absolute', top: (h - START_HOUR) * HOUR_HEIGHT, left: 0, right: 0 }}>
                      <span className="text-[10px] select-none" style={{ color: '#64748b', lineHeight: 1, display: 'block', marginTop: -8, paddingLeft: 4 }}>
                        {format(new Date(2000, 0, 1, h), 'ha')}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Events column */}
                <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                  {/* Hour lines */}
                  {hours.map(h => (
                    <div
                      key={h}
                      style={{ position: 'absolute', top: (h - START_HOUR) * HOUR_HEIGHT, left: 0, right: 0, borderTop: '1px solid #2d3f55' }}
                    />
                  ))}

                  {/* Events */}
                  {events.map(ev => {
                    const start = parseISO(ev.startDatetime)
                    const end = parseISO(ev.endDatetime)
                    const top = timeToY(start)
                    const height = durationToHeight(start, end)
                    const color = '#a78bfa'
                    const { column, totalColumns } = overlapLayout.get(ev.id) ?? { column: 0, totalColumns: 1 }
                    const leftPct = (column / totalColumns) * 100
                    const widthPct = (1 / totalColumns) * 100
                    return (
                      <div
                        key={ev.id}
                        style={{
                          position: 'absolute',
                          top,
                          height,
                          left: `${leftPct}%`,
                          width: `calc(${widthPct}% - 2px)`,
                          backgroundColor: '#a78bfa25',
                          borderLeft: `3px solid ${color}`,
                          borderRadius: 5,
                          padding: '2px 5px',
                          overflow: 'hidden',
                          boxSizing: 'border-box',
                        }}
                      >
                        <p className="text-[11px] font-semibold" style={{ color, wordBreak: 'break-word', whiteSpace: 'normal' }}>{ev.title}</p>
                        <p className="text-[10px]" style={{ color, opacity: 0.7 }}>{format(start, 'h:mm')}–{format(end, 'h:mm a')}</p>
                      </div>
                    )
                  })}

                  {/* Timeboxed tasks */}
                  {todayTasks.map((task: Task) => {
                    const start = parseISO(task.timeboxStart!)
                    const end = parseISO(task.timeboxEnd!)
                    const top = timeToY(start)
                    const height = durationToHeight(start, end)
                    const color = '#c4b5fd'
                    const { column, totalColumns } = overlapLayout.get(task.id) ?? { column: 0, totalColumns: 1 }
                    const leftPct = (column / totalColumns) * 100
                    const widthPct = (1 / totalColumns) * 100
                    return (
                      <div
                        key={task.id}
                        style={{
                          position: 'absolute',
                          top,
                          height,
                          left: `${leftPct}%`,
                          width: `calc(${widthPct}% - 2px)`,
                          backgroundColor: '#a78bfa18',
                          borderLeft: `3px dashed ${color}`,
                          borderRadius: 5,
                          padding: '2px 5px',
                          overflow: 'hidden',
                          boxSizing: 'border-box',
                        }}
                      >
                        <p className="text-[11px] font-medium" style={{ color, wordBreak: 'break-word', whiteSpace: 'normal' }}>{task.title}</p>
                      </div>
                    )
                  })}

                  {/* Current time indicator */}
                  {isSameDay(now, today) && (
                    <div style={{ position: 'absolute', top: nowY, left: 0, right: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f472b6', flexShrink: 0, marginLeft: -3 }} />
                      <div style={{ flex: 1, height: 1.5, background: '#f472b6', opacity: 0.8 }} />
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
