'use client'
import { useEffect, useRef, useState } from 'react'
import { format, parseISO, isSameDay, differenceInMinutes } from 'date-fns'
import { useAppStore } from '@/store/useAppStore'
import { CalendarEvent, Task } from '@/types'

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
  const { tasks, calendars } = useAppStore()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [now, setNow] = useState(new Date())
  const scrollRef = useRef<HTMLDivElement>(null)
  const today = new Date()

  // Fetch today's events
  useEffect(() => {
    const start = new Date(today); start.setHours(0, 0, 0, 0)
    const end = new Date(today); end.setHours(23, 59, 59, 999)
    fetch(`/api/events?start=${start.toISOString()}&end=${end.toISOString()}`)
      .then(r => r.ok ? r.json() : [])
      .then(setEvents)
      .catch(() => {})
  }, [])

  // Update current time indicator every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const y = timeToY(now)
      scrollRef.current.scrollTop = Math.max(0, y - 80)
    }
  }, [])

  const todayTasks = tasks.filter(t =>
    t.timeboxStart && t.timeboxEnd && isSameDay(parseISO(t.timeboxStart), today)
  )

  const nowY = timeToY(now)
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

  return (
    <div className="flex flex-col w-48 border-l border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex-shrink-0 h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-stone-100 dark:border-stone-800 flex-shrink-0">
        <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">Today</p>
        <p className="text-lg font-bold text-stone-800 dark:text-stone-100 leading-tight">{format(today, 'EEEE')}</p>
        <p className="text-xs text-stone-400">{format(today, 'MMMM d')}</p>
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT, position: 'relative' }}>
          {/* Hour lines */}
          {hours.map(h => (
            <div
              key={h}
              style={{ position: 'absolute', top: (h - START_HOUR) * HOUR_HEIGHT, left: 0, right: 0 }}
              className="border-t border-stone-100 dark:border-stone-800 flex items-start"
            >
              <span className="text-[10px] text-stone-300 dark:text-stone-600 px-1.5 leading-none -mt-2 select-none">
                {format(new Date(2000, 0, 1, h), 'ha')}
              </span>
            </div>
          ))}

          {/* Events */}
          {events.map(ev => {
            const start = parseISO(ev.startDatetime)
            const end = parseISO(ev.endDatetime)
            const top = timeToY(start)
            const height = durationToHeight(start, end)
            const color = ev.channel?.color || ev.calendar?.color || '#6366f1'
            return (
              <div
                key={ev.id}
                style={{
                  position: 'absolute',
                  top,
                  height,
                  left: 28,
                  right: 4,
                  backgroundColor: color + '22',
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 5,
                  padding: '2px 5px',
                  overflow: 'hidden',
                }}
              >
                <p className="text-[11px] font-semibold truncate" style={{ color }}>{ev.title}</p>
                <p className="text-[10px] opacity-60 truncate" style={{ color }}>
                  {format(start, 'h:mm')}–{format(end, 'h:mm a')}
                </p>
              </div>
            )
          })}

          {/* Timebox tasks */}
          {todayTasks.map((task: Task) => {
            const start = parseISO(task.timeboxStart!)
            const end = parseISO(task.timeboxEnd!)
            const top = timeToY(start)
            const height = durationToHeight(start, end)
            const color = task.channel?.color || '#6366f1'
            return (
              <div
                key={task.id}
                style={{
                  position: 'absolute',
                  top,
                  height,
                  left: 28,
                  right: 4,
                  backgroundColor: color + '15',
                  borderLeft: `3px dashed ${color}`,
                  borderRadius: 5,
                  padding: '2px 5px',
                  overflow: 'hidden',
                }}
              >
                <p className="text-[11px] font-medium truncate" style={{ color }}>{task.title}</p>
              </div>
            )
          })}

          {/* Current time indicator */}
          {isSameDay(now, today) && (
            <div style={{ position: 'absolute', top: nowY, left: 24, right: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0, marginLeft: -3 }} />
              <div style={{ flex: 1, height: 1, background: '#ef4444' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
