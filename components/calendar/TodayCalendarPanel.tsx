'use client'
import { useEffect, useRef, useState } from 'react'
import { format, parseISO, isSameDay, differenceInMinutes } from 'date-fns'
import { useAppStore } from '@/store/useAppStore'
import { CalendarEvent, Task } from '@/types'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const HOUR_HEIGHT = 56
const START_HOUR = 7
const END_HOUR = 23

function timeToY(dt: Date): number {
  const h = dt.getHours() + dt.getMinutes() / 60
  return Math.max(0, (h - START_HOUR) * HOUR_HEIGHT)
}

function durationToHeight(start: Date, end: Date): number {
  return Math.max((differenceInMinutes(end, start) / 60) * HOUR_HEIGHT, 18)
}

export default function TodayCalendarPanel() {
  const { tasks } = useAppStore()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [now, setNow] = useState(new Date())
  const [expanded, setExpanded] = useState(true)
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

  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = Math.max(0, timeToY(now) - 80)
    }
  }, [expanded])

  const todayTasks = tasks.filter(t =>
    t.timeboxStart && t.timeboxEnd && isSameDay(parseISO(t.timeboxStart), today)
  )
  const nowY = timeToY(now)
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

  return (
    <div
      className="flex flex-col flex-shrink-0 h-full border-l border-violet-200 transition-all duration-300"
      style={{
        width: expanded ? 220 : 36,
        background: 'linear-gradient(180deg, #f5f3ff 0%, #ede9fe 100%)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-3 border-b border-violet-200 flex-shrink-0" style={{ minHeight: 56 }}>
        {expanded && (
          <div className="min-w-0 ml-1">
            <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest">Today</p>
            <p className="text-sm font-bold text-violet-800 leading-tight truncate">{format(today, 'EEEE')}</p>
            <p className="text-[11px] text-violet-400">{format(today, 'MMMM d')}</p>
          </div>
        )}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-violet-200 text-violet-500 transition-colors ml-auto"
          title={expanded ? 'Collapse' : 'Expand today'}
        >
          {expanded ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Collapsed label */}
      {!expanded && (
        <div className="flex-1 flex items-center justify-center">
          <span
            className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest select-none"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Today · {format(today, 'MMM d')}
          </span>
        </div>
      )}

      {/* Time grid */}
      {expanded && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
          <div style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT, position: 'relative' }}>
            {hours.map(h => (
              <div
                key={h}
                style={{ position: 'absolute', top: (h - START_HOUR) * HOUR_HEIGHT, left: 0, right: 0 }}
                className="border-t border-violet-100 flex items-start"
              >
                <span className="text-[10px] text-violet-300 px-1.5 leading-none -mt-2 select-none">
                  {format(new Date(2000, 0, 1, h), 'ha')}
                </span>
              </div>
            ))}

            {events.map(ev => {
              const start = parseISO(ev.startDatetime)
              const end = parseISO(ev.endDatetime)
              const top = timeToY(start)
              const height = durationToHeight(start, end)
              const color = ev.channel?.color || ev.calendar?.color || '#7c3aed'
              return (
                <div key={ev.id} style={{ position: 'absolute', top, height, left: 30, right: 4, backgroundColor: color + '25', borderLeft: `3px solid ${color}`, borderRadius: 5, padding: '2px 5px', overflow: 'hidden' }}>
                  <p className="text-[11px] font-semibold truncate" style={{ color }}>{ev.title}</p>
                  <p className="text-[10px] opacity-60 truncate" style={{ color }}>{format(start, 'h:mm')}–{format(end, 'h:mm a')}</p>
                </div>
              )
            })}

            {todayTasks.map((task: Task) => {
              const start = parseISO(task.timeboxStart!)
              const end = parseISO(task.timeboxEnd!)
              const top = timeToY(start)
              const height = durationToHeight(start, end)
              const color = task.channel?.color || '#7c3aed'
              return (
                <div key={task.id} style={{ position: 'absolute', top, height, left: 30, right: 4, backgroundColor: color + '15', borderLeft: `3px dashed ${color}`, borderRadius: 5, padding: '2px 5px', overflow: 'hidden' }}>
                  <p className="text-[11px] font-medium truncate" style={{ color }}>{task.title}</p>
                </div>
              )
            })}

            {isSameDay(now, today) && (
              <div style={{ position: 'absolute', top: nowY, left: 26, right: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c3aed', flexShrink: 0, marginLeft: -3 }} />
                <div style={{ flex: 1, height: 1.5, background: '#7c3aed', opacity: 0.7 }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
