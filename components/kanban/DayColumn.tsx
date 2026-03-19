'use client'
import React, { useState, useRef, useEffect } from 'react'
import { format, isToday, parseISO, differenceInMinutes } from 'date-fns'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useAppStore } from '@/store/useAppStore'
import { Task, CalendarEvent } from '@/types'
import { cn, minutesToHours } from '@/lib/utils'
import { Plus, Calendar, Check } from 'lucide-react'
import TaskCard from '../task/TaskCard'

const TIME_OPTIONS = [
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '20 min', value: 20 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hr', value: 60 },
  { label: '1.5 hr', value: 90 },
  { label: '2 hr', value: 120 },
  { label: '3 hr', value: 180 },
  { label: '4 hr', value: 240 },
  { label: '5 hr', value: 300 },
  { label: '6 hr', value: 360 },
]

interface Props {
  date: Date
  dateStr: string
  tasks: Task[]
  events: CalendarEvent[]
  loading: boolean
  isDragTarget?: boolean
}

function EventChipDroppable({ event }: { event: CalendarEvent }) {
  const { setNodeRef, isOver } = useDroppable({ id: event.id })
  const { updateEvent } = useAppStore()
  const [completed, setCompleted] = useState(event.isCompleted)
  // Keep in sync if parent re-fetches
  useEffect(() => setCompleted(event.isCompleted), [event.isCompleted])

  const isTentative = event.status === 'tentative'
  const color = '#a78bfa'
  const start = parseISO(event.startDatetime)
  const end = parseISO(event.endDatetime)
  const durationMins = differenceInMinutes(end, start)

  async function toggleComplete(e: React.MouseEvent) {
    e.stopPropagation()
    const newCompleted = !completed
    setCompleted(newCompleted) // instant UI update
    const completedAt = newCompleted ? new Date().toISOString() : null
    updateEvent(event.id, { isCompleted: newCompleted, completedAt })
    await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted: newCompleted, completedAt }),
    })
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-start gap-2 px-2.5 py-1.5 rounded-lg border text-xs select-none transition-colors',
        isOver && 'brightness-95',
        completed && 'opacity-60',
        isTentative && 'opacity-80'
      )}
      style={{
        backgroundColor: color + '14',
        borderColor: color + '40',
        borderLeftColor: color,
        borderLeftWidth: 3,
        borderLeftStyle: isTentative ? 'dashed' : 'solid',
      }}
    >
      {/* Complete button */}
      <button
        onClick={toggleComplete}
        className={cn(
          'flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
          completed
            ? 'bg-pink-300 border-pink-300 text-white'
            : 'border-stone-300 dark:border-stone-600 hover:border-pink-300'
        )}
      >
        {completed && <Check size={10} strokeWidth={3} />}
      </button>

      <Calendar size={11} className="flex-shrink-0 mt-0.5" style={{ color }} />
      <div className="flex-1 min-w-0">
        <p className={cn('font-medium break-words', completed && 'line-through')} style={{ color }}>
          {event.title}
          {isTentative && <span className="ml-1 opacity-60 font-normal">(tentative)</span>}
        </p>
        {!event.isAllDay && (
          <p className="opacity-60 mt-0.5" style={{ color }}>
            {format(start, 'h:mm a')}
            {durationMins > 0 && ` · ${minutesToHours(durationMins)}`}
          </p>
        )}
      </div>
    </div>
  )
}

export type CombinedItem =
  | { type: 'task'; id: string; position: number }
  | { type: 'event'; id: string; position: number }

export function buildMergedItems(tasks: Task[], events: CalendarEvent[]): CombinedItem[] {
  return [
    ...tasks.map(t => ({ type: 'task' as const, id: t.id, position: t.sortOrder })),
    ...events.map(e => ({
      type: 'event' as const,
      id: e.id,
      position: parseISO(e.startDatetime).getHours() * 60 + parseISO(e.startDatetime).getMinutes(),
    })),
  ].sort((a, b) => a.position - b.position)
}

export default function DayColumn({ date, dateStr, tasks, events: allEvents, loading, isDragTarget }: Props) {
  const { isOver: isColOver, setNodeRef: setColRef } = useDroppable({ id: dateStr })
  const { addTask } = useAppStore()
  // Only show confirmed events on Home (filter out cancelled)
  const events = allEvents.filter(e => !e.status || e.status === 'confirmed' || e.status === 'tentative')
  const [addingTask, setAddingTask] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newMinutes, setNewMinutes] = useState<number | null>(null)
  const [newRepeat, setNewRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none')
  const inputRef = useRef<HTMLInputElement>(null)

  const today = isToday(date)
  const completed = tasks.filter(t => t.status === 'complete').length
  const total = tasks.length
  const progress = total === 0 ? 0 : (completed / total) * 100

  const taskMinutes = tasks.reduce((sum, t) => sum + (t.plannedTimeMinutes || 0), 0)
  const meetingMinutes = events
    .filter(e => !e.isAllDay)
    .reduce((sum, e) => sum + Math.max(0, differenceInMinutes(parseISO(e.endDatetime), parseISO(e.startDatetime))), 0)
  const totalMinutes = taskMinutes + meetingMinutes

  const mergedItems = buildMergedItems(tasks, events)
  const sortedTaskIds = mergedItems.filter(i => i.type === 'task').map(i => i.id)

  const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]))
  const eventMap = Object.fromEntries(events.map(e => [e.id, e]))

  useEffect(() => {
    if (addingTask) inputRef.current?.focus()
  }, [addingTask])

  function cancel() {
    setAddingTask(false)
    setNewTitle('')
    setNewMinutes(null)
    setNewRepeat('none')
  }

  async function handleAddTask(e?: React.FormEvent) {
    e?.preventDefault()
    if (!newTitle.trim()) { cancel(); return }

    let isRecurring = false
    let recurrenceRule: string | null = null
    if (newRepeat !== 'none') {
      isRecurring = true
      const [y, m, d] = dateStr.split('-').map(Number)
      const dow = new Date(y, m - 1, d).getDay()
      if (newRepeat === 'daily') recurrenceRule = JSON.stringify({ freq: 'daily' })
      else if (newRepeat === 'weekly') recurrenceRule = JSON.stringify({ freq: 'weekly', days: [dow] })
      else if (newRepeat === 'monthly') recurrenceRule = JSON.stringify({ freq: 'monthly', dayOfMonth: d })
    }

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle.trim(),
        scheduledDate: dateStr,
        sortOrder: tasks.length,
        plannedTimeMinutes: newMinutes,
        isRecurring,
        recurrenceRule,
      }),
    })
    const task: Task = await res.json()
    addTask(task)
    cancel()
  }

  return (
    <div
      ref={setColRef}
      className={cn(
        'flex flex-col min-w-[220px] w-[220px] border-r border-stone-200 dark:border-stone-800 h-full',
        today ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : 'bg-white dark:bg-stone-900',
        (isColOver || isDragTarget) && 'bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-inset ring-indigo-300 dark:ring-indigo-700'
      )}
    >
      {/* Column header */}
      <div className={cn('px-3 pt-3 pb-2 border-b border-stone-100 dark:border-stone-800', today && 'border-indigo-200 dark:border-indigo-900')}>
        <div className="flex items-baseline justify-between mb-1">
          <div>
            <span className={cn('text-xs font-medium uppercase tracking-wider', today ? 'text-indigo-600 dark:text-indigo-400' : 'text-stone-400')}>
              {format(date, 'EEE')}
            </span>
            <span className={cn('ml-1.5 text-lg font-semibold', today ? 'text-indigo-700 dark:text-indigo-300' : 'text-stone-700 dark:text-stone-300')}>
              {format(date, 'd')}
            </span>
          </div>
        </div>

        {/* Stats row */}
        {totalMinutes > 0 && (
          <div className="flex items-center gap-2 mt-1 mb-1.5 flex-wrap">
            {meetingMinutes > 0 && (
              <span className="text-xs text-blue-500 dark:text-blue-400 flex items-center gap-0.5">
                <Calendar size={10} />
                {minutesToHours(meetingMinutes)} meetings
              </span>
            )}
            {taskMinutes > 0 && (
              <span className="text-xs text-stone-400">{minutesToHours(taskMinutes)} tasks</span>
            )}
            {meetingMinutes > 0 && taskMinutes > 0 && (
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                = {minutesToHours(totalMinutes)} total
              </span>
            )}
          </div>
        )}

        <div className="h-1 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Interleaved tasks + events */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {/* Add task */}
        {addingTask ? (
          <form onSubmit={handleAddTask} className="mt-1 space-y-1">
            <input
              ref={inputRef}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && cancel()}
              placeholder="Task name…"
              className="w-full text-sm px-2 py-1.5 rounded border border-indigo-400 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none"
            />
            <select
              value={newMinutes ?? ''}
              onChange={e => setNewMinutes(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full text-xs px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-400 focus:outline-none focus:border-indigo-400"
            >
              <option value="">Est. time (optional)</option>
              {TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <select
              value={newRepeat}
              onChange={e => setNewRepeat(e.target.value as 'none' | 'daily' | 'weekly' | 'monthly')}
              className="w-full text-xs px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-400 focus:outline-none focus:border-indigo-400"
            >
              <option value="none">No repeat</option>
              <option value="daily">Repeat daily</option>
              <option value="weekly">Repeat weekly</option>
              <option value="monthly">Repeat monthly</option>
            </select>
            <div className="flex items-center gap-1">
              <button type="submit" className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors">Add</button>
              <button type="button" onClick={cancel} className="text-xs px-2 py-1 text-stone-400 hover:text-stone-600 transition-colors">✕</button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAddingTask(true)}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 mt-1 px-1 py-1 w-full transition-colors group"
          >
            <Plus size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            Add task
          </button>
        )}

        <SortableContext items={sortedTaskIds} strategy={verticalListSortingStrategy}>
          {loading ? (
            <div className="space-y-1.5">
              {[1, 2].map(i => <div key={i} className="h-12 bg-stone-100 dark:bg-stone-800 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            mergedItems.map(item =>
              item.type === 'event'
                ? <EventChipDroppable key={item.id} event={eventMap[item.id]} />
                : <TaskCard key={item.id} task={taskMap[item.id]} />
            )
          )}
        </SortableContext>
      </div>
    </div>
  )
}
