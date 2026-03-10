'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { format, addDays, startOfWeek, addHours, differenceInMinutes, parseISO, isSameDay, addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { CalendarEvent, Task } from '@/types'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

const HOUR_HEIGHT = 64 // px per hour
const START_HOUR = 0
const END_HOUR = 24
const TOTAL_HOURS = END_HOUR - START_HOUR

type ViewMode = 'day' | '3day' | 'week' | 'month'

function timeToY(datetime: Date): number {
  const h = datetime.getHours() + datetime.getMinutes() / 60
  return (h - START_HOUR) * HOUR_HEIGHT
}

function durationToHeight(startDt: Date, endDt: Date): number {
  const mins = differenceInMinutes(endDt, startDt)
  return Math.max((mins / 60) * HOUR_HEIGHT, 20)
}

interface EventBlockProps {
  event: CalendarEvent
  columnWidth: number
  onDelete: (id: string) => void
  onEdit: (event: CalendarEvent) => void
}

function EventBlock({ event, onDelete, onEdit }: EventBlockProps) {
  const start = parseISO(event.startDatetime)
  const end = parseISO(event.endDatetime)
  const top = timeToY(start)
  const height = durationToHeight(start, end)
  const color = event.channel?.color || event.calendar?.color || '#6366f1'

  return (
    <div
      className="absolute left-0 right-1 rounded-md px-2 py-1 cursor-pointer group overflow-hidden"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        backgroundColor: color + '22',
        borderLeft: `3px solid ${color}`,
      }}
      onClick={() => onEdit(event)}
    >
      <p className="text-xs font-medium truncate" style={{ color }}>{event.title}</p>
      <p className="text-xs opacity-60" style={{ color }}>
        {format(start, 'h:mm a')}
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
  const color = task.channel?.color || '#6366f1'

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
  const { events, setEvents, tasks } = useAppStore()
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [newEventSlot, setNewEventSlot] = useState<Date | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Suppress unused variable warning for editingEvent setter
  void editingEvent

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

  useEffect(() => { loadEvents() }, [loadEvents])

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
    const y = e.clientY - rect.top + (e.currentTarget.parentElement?.scrollTop || 0)
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
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
        <div className="flex flex-1 overflow-hidden">
          {/* Time gutter */}
          <div className="w-14 flex-shrink-0 border-r border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="h-10 border-b border-stone-200 dark:border-stone-800" /> {/* header spacer */}
            <div className="overflow-hidden" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
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
          <div className="flex flex-1 overflow-x-auto overflow-y-hidden min-w-0">
            <div className="flex flex-1 min-w-0" style={{ minWidth: days.length * 120 }}>
              {/* Day headers */}
              <div className="flex w-full border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 h-10 absolute" style={{ width: 'calc(100% - 56px)' }}>
                {days.map((day, i) => (
                  <div key={i} className={cn('flex-1 flex items-center justify-center text-xs font-medium', isSameDay(day, new Date()) ? 'text-indigo-600 dark:text-indigo-400' : 'text-stone-500')}>
                    <span className="mr-1">{format(day, 'EEE')}</span>
                    <span className={cn('w-6 h-6 rounded-full flex items-center justify-center', isSameDay(day, new Date()) && 'bg-indigo-600 text-white')}>
                      {format(day, 'd')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Scrollable time grid */}
              <div ref={scrollRef} className="flex flex-1 overflow-y-auto mt-10">
                {days.map((day, di) => (
                  <div
                    key={di}
                    className={cn(
                      'flex-1 relative border-r border-stone-200 dark:border-stone-800 cursor-pointer',
                      isSameDay(day, new Date()) && 'bg-indigo-50/20 dark:bg-indigo-950/10'
                    )}
                    style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT, height: TOTAL_HOURS * HOUR_HEIGHT }}
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

                    {/* Events */}
                    <div className="absolute inset-0 pointer-events-none">
                      {events
                        .filter(ev => isSameDay(parseISO(ev.startDatetime), day))
                        .map(ev => (
                          <div key={ev.id} className="pointer-events-auto">
                            <EventBlock
                              event={ev}
                              columnWidth={100}
                              onDelete={handleDeleteEvent}
                              onEdit={setEditingEvent}
                            />
                          </div>
                        ))}
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
  // Suppress unused param — days prop is kept for API consistency but month view recomputes its own grid
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
            const dayEvents = events.filter(e => isSameDay(parseISO(e.startDatetime), d))
            const dayTasks = tasks.filter(t => t.scheduledDate === format(d, 'yyyy-MM-dd'))
            return (
              <div key={di} className={cn('p-1 border-r border-stone-200 dark:border-stone-800 min-h-[100px]', !isCurrentMonth && 'bg-stone-50 dark:bg-stone-900/50')}>
                <span className={cn('text-xs w-6 h-6 flex items-center justify-center rounded-full mb-1', isToday ? 'bg-indigo-600 text-white' : isCurrentMonth ? 'text-stone-700 dark:text-stone-300' : 'text-stone-400')}>
                  {format(d, 'd')}
                </span>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 2).map(e => (
                    <div key={e.id} className="text-xs px-1 rounded truncate" style={{ backgroundColor: (e.calendar?.color || '#6366f1') + '22', color: e.calendar?.color || '#6366f1' }}>
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
