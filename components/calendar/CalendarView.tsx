'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { format, addDays, startOfWeek, addHours, differenceInMinutes, parseISO, isSameDay, addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { CalendarEvent, Task } from '@/types'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, X, Globe, Clock, MapPin, User, Users, AlignLeft, Calendar as CalendarIcon } from 'lucide-react'

const HOUR_HEIGHT = 64 // px per hour
const START_HOUR = 0
const END_HOUR = 24
const TOTAL_HOURS = END_HOUR - START_HOUR

type ViewMode = 'day' | '3day' | 'week' | 'month'

// US timezone definitions
const US_TIMEZONES = [
  { id: 'ET', label: 'ET', iana: 'America/New_York' },
  { id: 'CT', label: 'CT', iana: 'America/Chicago' },
  { id: 'MT', label: 'MT', iana: 'America/Denver' },
  { id: 'PT', label: 'PT', iana: 'America/Los_Angeles' },
]

function getUserPrimaryTzId(): string {
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const match = US_TIMEZONES.find(tz => tz.iana === userTz)
  return match?.id ?? 'ET' // default to ET for non-US timezones
}

function getHourLabel(localHour: number, targetIana: string): string {
  const d = new Date()
  d.setHours(localHour, 0, 0, 0)
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: true,
    timeZone: targetIana,
  }).format(d).replace(' AM', 'a').replace(' PM', 'p')
}

function timeToY(datetime: Date): number {
  const h = datetime.getHours() + datetime.getMinutes() / 60
  return (h - START_HOUR) * HOUR_HEIGHT
}

function durationToHeight(startDt: Date, endDt: Date): number {
  const mins = differenceInMinutes(endDt, startDt)
  return Math.max((mins / 60) * HOUR_HEIGHT, 20)
}

/**
 * Compute side-by-side layout for overlapping events in a single day column.
 *
 * Algorithm:
 *  1. Sort events by start time and greedily assign columns (interval scheduling).
 *  2. For each event, compute totalColumns = max number of events simultaneously
 *     active at any moment during *that event's* duration.
 *     This ensures solo / non-overlapping events always get full width, and events
 *     that only partially overlap (A-B-C chain where A and C don't directly overlap)
 *     are sized based on their own actual concurrency rather than the whole chain.
 */
function computeOverlapLayout(events: CalendarEvent[]): Map<string, { column: number; totalColumns: number }> {
  const result = new Map<string, { column: number; totalColumns: number }>()
  if (events.length === 0) return result

  const parsed = events.map(e => ({
    id: e.id,
    start: parseISO(e.startDatetime).getTime(),
    end: parseISO(e.endDatetime).getTime(),
  }))

  // Step 1: greedy column assignment sorted by start time
  const sorted = [...parsed].sort((a, b) => a.start - b.start || b.end - a.end)
  const colEnds: number[] = []
  const columnOf = new Map<string, number>()

  for (const ev of sorted) {
    let col = colEnds.findIndex(end => end <= ev.start)
    if (col === -1) col = colEnds.length
    colEnds[col] = ev.end
    columnOf.set(ev.id, col)
  }

  // Step 2: per-event totalColumns = max concurrency at any moment during this event
  for (const ev of parsed) {
    // Events that overlap with ev (strictly: one starts before the other ends)
    const overlapping = parsed.filter(o => o.id !== ev.id && o.start < ev.end && o.end > ev.start)

    if (overlapping.length === 0) {
      result.set(ev.id, { column: 0, totalColumns: 1 })
      continue
    }

    // Collect boundary times within ev's duration to create sub-intervals
    const boundaries = new Set<number>([ev.start])
    for (const o of overlapping) {
      if (o.start > ev.start && o.start < ev.end) boundaries.add(o.start)
      if (o.end > ev.start && o.end < ev.end) boundaries.add(o.end)
    }
    boundaries.add(ev.end)
    const pts = [...boundaries].sort((a, b) => a - b)

    // Find max concurrent events at the midpoint of each sub-interval
    let maxConcurrent = 1
    for (let i = 0; i < pts.length - 1; i++) {
      const mid = (pts[i] + pts[i + 1]) / 2
      // Count how many events (including ev itself) are active at mid
      const count = parsed.filter(o => o.start <= mid && o.end > mid).length
      maxConcurrent = Math.max(maxConcurrent, count)
    }

    const myCol = columnOf.get(ev.id)!
    result.set(ev.id, { column: myCol, totalColumns: Math.max(maxConcurrent, myCol + 1) })
  }

  return result
}

interface EventBlockProps {
  event: CalendarEvent
  column: number
  totalColumns: number
  onDelete: (id: string) => void
  onEdit: (event: CalendarEvent) => void
}

function EventBlock({ event, column, totalColumns, onDelete, onEdit }: EventBlockProps) {
  const start = parseISO(event.startDatetime)
  const end = parseISO(event.endDatetime)
  const top = timeToY(start)
  const height = durationToHeight(start, end)
  const isCancelled = event.status === 'cancelled'
  const isTentative = event.status === 'tentative'
  const color = isCancelled ? '#9ca3af' : '#a78bfa'
  const bgOpacity = isCancelled ? '11' : isTentative ? '10' : '22'
  const borderStyle = isTentative ? 'dashed' : 'solid'

  const leftPct = (column / totalColumns) * 100
  const widthPct = (1 / totalColumns) * 100

  return (
    <div
      className="absolute rounded-md px-2 py-1 cursor-pointer group overflow-hidden"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 3px)`,
        backgroundColor: color + bgOpacity,
        borderLeft: `3px ${borderStyle} ${color}`,
        opacity: isCancelled ? 0.5 : 1,
      }}
      onClick={e => { e.stopPropagation(); onEdit(event) }}
    >
      <p className={cn('text-xs font-medium truncate', isCancelled && 'line-through')} style={{ color }}>{event.title}</p>
      <p className="text-xs opacity-60" style={{ color }}>
        {format(start, 'h:mm a')}
        {isTentative && <span className="ml-1 opacity-70">(tentative)</span>}
      </p>
      <button
        onClick={e => { e.stopPropagation(); onDelete(event.id) }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={10} />
      </button>
    </div>
  )
}

interface TaskBlockProps {
  task: Task
}

function TaskBlock({ task }: TaskBlockProps) {
  if (!task.timeboxStart || !task.timeboxEnd) return null
  const start = parseISO(task.timeboxStart)
  const end = parseISO(task.timeboxEnd)
  const top = timeToY(start)
  const height = durationToHeight(start, end)
  const color = '#a78bfa'

  return (
    <div
      className="absolute left-0 right-1 rounded-md px-2 py-1 overflow-hidden"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        backgroundColor: color + '15',
        borderLeft: `3px solid ${color}`,
        borderStyle: 'dashed solid solid dashed',
      }}
    >
      <p className="text-xs font-medium truncate" style={{ color }}>{task.title}</p>
    </div>
  )
}

interface EventDetailModalProps {
  event: CalendarEvent
  onClose: () => void
  onDelete: (id: string) => void
}

function EventDetailModal({ event, onClose, onDelete }: EventDetailModalProps) {
  const start = parseISO(event.startDatetime)
  const end = parseISO(event.endDatetime)
  const color = event.channel?.color || event.calendar?.color || '#6366f1'
  const isSameDay_ = isSameDay(start, end) || (end.getHours() === 0 && end.getMinutes() === 0 && differenceInMinutes(end, start) <= 1440)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-80 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Color bar */}
        <div className="h-1.5" style={{ backgroundColor: color }} />
        <div className="p-5">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 mb-4">
            <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200 leading-snug">{event.title}</h3>
            <button onClick={onClose} className="flex-shrink-0 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors mt-0.5">
              <X size={14} />
            </button>
          </div>

          <div className="space-y-2">
            {/* Time */}
            <div className="flex items-start gap-2 text-xs text-stone-600 dark:text-stone-400">
              <Clock size={13} className="flex-shrink-0 mt-0.5" />
              <div>
                <span>{format(start, 'EEEE, MMMM d')}</span>
                {!event.isAllDay && (
                  <span className="ml-1 text-stone-500">
                    {isSameDay_ ? `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}` : `${format(start, 'h:mm a')} – ${format(end, 'MMM d, h:mm a')}`}
                  </span>
                )}
              </div>
            </div>

            {/* Location */}
            {event.location && (
              <div className="flex items-start gap-2 text-xs text-stone-600 dark:text-stone-400">
                <MapPin size={13} className="flex-shrink-0 mt-0.5" />
                <span className="break-words">{event.location}</span>
              </div>
            )}

            {/* Organizer */}
            {event.organizer && (
              <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
                <User size={13} className="flex-shrink-0" />
                <span>{event.organizer}</span>
              </div>
            )}

            {/* Attendees */}
            {event.attendees && event.attendees.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-stone-600 dark:text-stone-400">
                <Users size={13} className="flex-shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  {event.attendees.slice(0, 8).map((a, i) => (
                    <span key={i}>{a}</span>
                  ))}
                  {event.attendees.length > 8 && (
                    <span className="text-stone-400">+{event.attendees.length - 8} more</span>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div className="flex items-start gap-2 text-xs text-stone-500 dark:text-stone-500">
                <AlignLeft size={13} className="flex-shrink-0 mt-0.5" />
                <span className="whitespace-pre-wrap line-clamp-5 break-words">{event.description}</span>
              </div>
            )}

            {/* Calendar */}
            {event.calendar && (
              <div className="flex items-center gap-1.5 text-xs text-stone-400 pt-1">
                <CalendarIcon size={12} className="flex-shrink-0" />
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: event.calendar.color }} />
                <span>{event.calendar.name}</span>
              </div>
            )}
          </div>

          {/* Delete button */}
          <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex justify-end">
            <button
              onClick={() => { onDelete(event.id); onClose() }}
              className="text-xs px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface NewEventModalProps {
  start: Date
  onSave: (title: string, start: Date, end: Date) => void
  onClose: () => void
}

function NewEventModal({ start, onSave, onClose }: NewEventModalProps) {
  const [title, setTitle] = useState('')
  const [endTime, setEndTime] = useState(addHours(start, 1))
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3 text-stone-800 dark:text-stone-200">New Event</h3>
        <input
          ref={inputRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && title.trim()) onSave(title.trim(), start, endTime) }}
          placeholder="Event title"
          className="w-full text-sm px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
        />
        <div className="flex gap-2 text-xs text-stone-600 dark:text-stone-400 mb-4">
          <span>{format(start, 'h:mm a')}</span>
          <span>–</span>
          <input
            type="time"
            value={format(endTime, 'HH:mm')}
            onChange={e => {
              const [h, m] = e.target.value.split(':').map(Number)
              const d = new Date(start)
              d.setHours(h, m)
              setEndTime(d)
            }}
            className="bg-transparent border-b border-stone-300 dark:border-stone-700 focus:outline-none"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">Cancel</button>
          <button
            onClick={() => title.trim() && onSave(title.trim(), start, endTime)}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >Create</button>
        </div>
      </div>
    </div>
  )
}

export default function CalendarView() {
  const { events, setEvents, tasks, syncKey } = useAppStore()
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [newEventSlot, setNewEventSlot] = useState<Date | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [showExtraTimezones, setShowExtraTimezones] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // editingEvent is rendered as EventDetailModal below

  const primaryTzId = getUserPrimaryTzId()
  const extraTimezones = US_TIMEZONES.filter(tz => tz.id !== primaryTzId)

  // Compute visible day columns
  const days: Date[] = (() => {
    if (viewMode === 'day') return [currentDate]
    if (viewMode === '3day') return [currentDate, addDays(currentDate, 1), addDays(currentDate, 2)]
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  })()

  const rangeStart = days[0]
  const rangeEnd = addDays(days[days.length - 1], 1)

  const loadEvents = useCallback(async () => {
    const res = await fetch(`/api/events?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`)
    const data = await res.json()
    setEvents(data)
  }, [rangeStart.toISOString(), rangeEnd.toISOString(), setEvents])

  // Re-load events whenever range changes OR a background sync completes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadEvents() }, [loadEvents, syncKey])

  // Scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * HOUR_HEIGHT
    }
  }, [])

  function navigate(dir: 1 | -1) {
    if (viewMode === 'day') setCurrentDate(d => addDays(d, dir))
    else if (viewMode === '3day') setCurrentDate(d => addDays(d, dir * 3))
    else if (viewMode === 'week') setCurrentDate(d => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1))
    else setCurrentDate(d => dir === 1 ? addMonths(d, 1) : subMonths(d, 1))
  }

  function handleGridClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0)
    const hour = Math.floor(y / HOUR_HEIGHT)
    const mins = Math.round((y % HOUR_HEIGHT) / HOUR_HEIGHT * 60 / 15) * 15
    const slot = new Date(day)
    slot.setHours(hour, mins, 0, 0)
    setNewEventSlot(slot)
  }

  async function handleCreateEvent(title: string, start: Date, end: Date) {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        startDatetime: start.toISOString(),
        endDatetime: end.toISOString(),
        isAllDay: false,
      }),
    })
    const event = await res.json()
    setEvents([...events, event])
    setNewEventSlot(null)
  }

  async function handleDeleteEvent(id: string) {
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    setEvents(events.filter(e => e.id !== id))
  }

  const timeboxedTasks = tasks.filter(t => t.timeboxStart && t.timeboxEnd)
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR)

  // Width of the gutter area
  const extraTzWidth = 36 // px per extra timezone column
  const mainGutterWidth = 56 // px for main time labels
  const gutterWidth = mainGutterWidth + (showExtraTimezones ? extraTimezones.length * extraTzWidth : 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top navigation header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-stone-700 dark:text-stone-300 min-w-[180px] text-center">
            {viewMode === 'month'
              ? format(currentDate, 'MMMM yyyy')
              : `${format(days[0], 'MMM d')} – ${format(days[days.length - 1], 'MMM d, yyyy')}`}
          </span>
          <button onClick={() => navigate(1)} className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 transition-colors">
            <ChevronRight size={18} />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="text-xs text-indigo-600 hover:underline ml-1">Today</button>
        </div>

        {/* View switcher */}
        <div className="flex gap-1 bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5">
          {(['day', '3day', 'week', 'month'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-md transition-colors',
                viewMode === v
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
              )}
            >
              {v === '3day' ? '3 Day' : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'month' ? (
        <MonthView days={days} currentDate={currentDate} tasks={tasks} events={events} />
      ) : (
        /*
         * Week/Day/3-Day view layout:
         * - Single scrollable container (vertical scroll)
         * - Sticky left gutter (timezone labels + time labels)
         * - Sticky top day headers
         * - Day columns fill the rest
         */
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Fixed header row: gutter corner + day column headers */}
          <div className="flex flex-shrink-0 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
            {/* Corner placeholder matching gutter width */}
            <div
              className="flex-shrink-0 border-r border-stone-200 dark:border-stone-800 flex items-end pb-1"
              style={{ width: gutterWidth }}
            >
              {/* Timezone toggle button */}
              <button
                onClick={() => setShowExtraTimezones(v => !v)}
                title={showExtraTimezones ? 'Hide other timezones' : 'Show US timezones'}
                className={cn(
                  'mx-auto flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded transition-colors',
                  showExtraTimezones
                    ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                    : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
                )}
              >
                <Globe size={10} />
                <span>{primaryTzId}</span>
              </button>
            </div>
            {/* Day headers — flex children, one per day */}
            <div className="flex flex-1" style={{ minWidth: days.length * 120 }}>
              {days.map((day, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex-1 flex items-center justify-center h-10 text-xs font-medium',
                    isSameDay(day, new Date()) ? 'text-indigo-600 dark:text-indigo-400' : 'text-stone-500'
                  )}
                >
                  <span className="mr-1">{format(day, 'EEE')}</span>
                  <span className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center',
                    isSameDay(day, new Date()) && 'bg-indigo-600 text-white'
                  )}>
                    {format(day, 'd')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable time grid */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto">
            <div className="flex" style={{ minWidth: gutterWidth + days.length * 120 }}>

              {/* Sticky left gutter: extra timezones + main time labels */}
              <div
                className="flex-shrink-0 sticky left-0 z-20 bg-white dark:bg-stone-900 border-r border-stone-200 dark:border-stone-800 flex"
                style={{ width: gutterWidth }}
              >
                {/* Collapsible extra timezone columns */}
                {showExtraTimezones && extraTimezones.map(tz => (
                  <div
                    key={tz.id}
                    className="border-r border-stone-100 dark:border-stone-800"
                    style={{ width: extraTzWidth }}
                  >
                    {hours.map(h => (
                      <div
                        key={h}
                        className="flex items-start justify-center"
                        style={{ height: HOUR_HEIGHT }}
                      >
                        {h !== 0 && (
                          <span className="text-[9px] text-stone-300 dark:text-stone-600 -mt-2 leading-none">
                            {getHourLabel(h, tz.iana)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}

                {/* Main time label column */}
                <div style={{ width: mainGutterWidth }}>
                  {hours.map(h => (
                    <div key={h} className="flex items-start" style={{ height: HOUR_HEIGHT }}>
                      <span className="text-xs text-stone-400 px-2 -mt-2">
                        {h === 0 ? '' : format(new Date().setHours(h, 0), 'h a')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Day columns */}
              <div className="flex" style={{ minWidth: days.length * 120, flex: 1 }}>
                {days.map((day, di) => (
                  <div
                    key={di}
                    className={cn(
                      'flex-1 relative border-r border-stone-200 dark:border-stone-800 cursor-pointer',
                      isSameDay(day, new Date()) && 'bg-indigo-50/20 dark:bg-indigo-950/10'
                    )}
                    style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT, height: TOTAL_HOURS * HOUR_HEIGHT, minWidth: 120 }}
                    onClick={(e) => handleGridClick(day, e)}
                  >
                    {/* Hour lines */}
                    {hours.map(h => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-stone-100 dark:border-stone-800/50"
                        style={{ top: h * HOUR_HEIGHT }}
                      />
                    ))}

                    {/* Current time indicator */}
                    {isSameDay(day, new Date()) && (
                      <div
                        className="absolute left-0 right-0 z-10 pointer-events-none"
                        style={{ top: timeToY(new Date()) }}
                      >
                        <div className="h-0.5 bg-red-500 relative">
                          <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
                        </div>
                      </div>
                    )}

                    {/* Events — side-by-side layout for overlaps */}
                    <div className="absolute inset-0 pointer-events-none">
                      {(() => {
                        const dayEvents = events.filter(ev => !ev.isAllDay && isSameDay(parseISO(ev.startDatetime), day))
                        const layout = computeOverlapLayout(dayEvents)
                        return dayEvents.map(ev => {
                          const { column, totalColumns } = layout.get(ev.id) ?? { column: 0, totalColumns: 1 }
                          return (
                            <div key={ev.id} className="pointer-events-auto">
                              <EventBlock
                                event={ev}
                                column={column}
                                totalColumns={totalColumns}
                                onDelete={handleDeleteEvent}
                                onEdit={setEditingEvent}
                              />
                            </div>
                          )
                        })
                      })()}
                      {timeboxedTasks
                        .filter(t => t.timeboxStart && isSameDay(parseISO(t.timeboxStart), day))
                        .map(t => (
                          <TaskBlock key={t.id} task={t} />
                        ))}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Event detail modal */}
      {editingEvent && (
        <EventDetailModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onDelete={handleDeleteEvent}
        />
      )}

      {/* New event modal */}
      {newEventSlot && (
        <NewEventModal
          start={newEventSlot}
          onSave={handleCreateEvent}
          onClose={() => setNewEventSlot(null)}
        />
      )}
    </div>
  )
}

function MonthView({ days, currentDate, tasks, events }: { days: Date[], currentDate: Date, tasks: Task[], events: CalendarEvent[] }) {
  void days

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const weeks: Date[][] = []
  let day = calStart
  while (day <= monthEnd || weeks.length < 6) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = addDays(day, 1)
    }
    weeks.push(week)
    if (weeks.length >= 6) break
  }

  return (
    <div className="flex-1 overflow-auto p-0">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-stone-200 dark:border-stone-800">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-stone-400">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-stone-200 dark:border-stone-800" style={{ minHeight: 100 }}>
          {week.map((d, di) => {
            const isCurrentMonth = d.getMonth() === currentDate.getMonth()
            const isToday = isSameDay(d, new Date())
            const dayEvents = events.filter(e => isSameDay(parseISO(e.startDatetime), d) && e.status !== 'cancelled')
            const dayTasks = tasks.filter(t => t.scheduledDate === format(d, 'yyyy-MM-dd'))
            return (
              <div key={di} className={cn('p-1 border-r border-stone-200 dark:border-stone-800 min-h-[100px]', !isCurrentMonth && 'bg-stone-50 dark:bg-stone-900/50')}>
                <span className={cn('text-xs w-6 h-6 flex items-center justify-center rounded-full mb-1', isToday ? 'bg-indigo-600 text-white' : isCurrentMonth ? 'text-stone-700 dark:text-stone-300' : 'text-stone-400')}>
                  {format(d, 'd')}
                </span>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 2).map(e => (
                    <div
                      key={e.id}
                      className="text-xs px-1 rounded truncate"
                      style={{
                        backgroundColor: '#a78bfa22',
                        color: e.status === 'tentative' ? '#a78bfaaa' : '#a78bfa',
                        opacity: e.status === 'cancelled' ? 0.5 : 1,
                      }}
                    >
                      {e.title}
                    </div>
                  ))}
                  {dayTasks.slice(0, 2).map(t => (
                    <div key={t.id} className="text-xs px-1 rounded truncate bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                      {t.title}
                    </div>
                  ))}
                  {(dayEvents.length + dayTasks.length) > 4 && (
                    <div className="text-xs text-stone-400 px-1">+{dayEvents.length + dayTasks.length - 4} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
