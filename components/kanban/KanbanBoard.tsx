'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { getWeekDays, formatDate } from '@/lib/utils'
import { addWeeks, subWeeks, isToday, parseISO } from 'date-fns'
import DayColumn, { buildMergedItems } from './DayColumn'
import TaskDetailPanel from '../task/TaskDetailPanel'
import { ChevronLeft, ChevronRight, Archive } from 'lucide-react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CalendarEvent, Task } from '@/types'
import TaskCard from '../task/TaskCard'

export default function KanbanBoard() {
  const {
    tasks, setTasks, activeTaskId, currentWeekStart,
    setCurrentWeekStart, setBacklogOpen, updateTask,
  } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [activeCard, setActiveCard] = useState<Task | null>(null)
  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const weekDays = getWeekDays(currentWeekStart)
  const dateStrings = weekDays.map(formatDate)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const loadTasks = useCallback(async () => {
    setLoading(true)
    const start = weekDays[0]
    const end = new Date(weekDays[6])
    end.setHours(23, 59, 59, 999)

    const [taskResults, eventsRes] = await Promise.all([
      Promise.all(dateStrings.map(date => fetch(`/api/tasks?date=${date}`).then(r => r.json()))),
      fetch(`/api/events?start=${start.toISOString()}&end=${end.toISOString()}`).then(r => r.ok ? r.json() : []),
    ])

    setTasks(taskResults.flat())
    setWeekEvents(eventsRes ?? [])
    setLoading(false)
  }, [dateStrings.join(','), setTasks])

  useEffect(() => { loadTasks() }, [loadTasks])

  // Scroll today's column into view on mount
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const todayIndex = weekDays.findIndex(d => isToday(d))
    if (todayIndex === -1) return
    const colWidth = 220
    container.scrollLeft = Math.max(0, todayIndex * colWidth - container.clientWidth / 2 + colWidth / 2)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') setCurrentWeekStart(subWeeks(currentWeekStart, 1))
      if (e.key === 'ArrowRight') setCurrentWeekStart(addWeeks(currentWeekStart, 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentWeekStart, setCurrentWeekStart])

  // Build merged list for a given date (used for position calculation)
  function getMergedList(dateStr: string) {
    const dayTasks = tasks.filter(t => t.scheduledDate === dateStr && !t.isArchived && t.parentTaskId === null)
    const dayEvents = weekEvents.filter(e => e.startDatetime.slice(0, 10) === dateStr)
    return buildMergedItems(dayTasks, dayEvents)
  }

  // Calculate a float sortOrder to insert the active task at the over target's position
  function calcNewPosition(dateStr: string, activeId: string, overId: string): number {
    const merged = getMergedList(dateStr)
    const activeIdx = merged.findIndex(i => i.id === activeId)
    const overIdx = merged.findIndex(i => i.id === overId)
    if (overIdx === -1) return 0

    const draggingDown = activeIdx < overIdx
    if (draggingDown) {
      // Place after the over item
      const after = merged[overIdx + 1]
      return after ? (merged[overIdx].position + after.position) / 2 : merged[overIdx].position + 1000
    } else {
      // Place before the over item
      const before = merged[overIdx - 1]
      return before ? (before.position + merged[overIdx].position) / 2 : merged[overIdx].position - 1
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCard(null)
    if (!over) return

    const taskId = active.id as string
    const overId = over.id as string
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    // Cross-column move (over.id is a date string)
    if (/^\d{4}-\d{2}-\d{2}$/.test(overId)) {
      if (task.scheduledDate === overId) return
      updateTask(taskId, { scheduledDate: overId, isBacklog: false })
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: overId, isBacklog: false }),
      })
      return
    }

    // Over a task or event — within-column reorder
    const dateStr = task.scheduledDate
    if (!dateStr) return

    // Check if over target belongs to same day
    const overTask = tasks.find(t => t.id === overId)
    const overEvent = weekEvents.find(e => e.id === overId)

    if (!overTask && !overEvent) return
    if (overTask && overTask.scheduledDate !== dateStr) return
    if (overEvent && parseISO(overEvent.startDatetime).toISOString().slice(0, 10) !== dateStr) return

    const newPos = calcNewPosition(dateStr, taskId, overId)
    updateTask(taskId, { sortOrder: newPos })
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sortOrder: newPos }),
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))} className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
            {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
            {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))} className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 transition-colors">
            <ChevronRight size={18} />
          </button>
          <button onClick={() => setCurrentWeekStart(new Date())} className="text-xs text-indigo-600 hover:underline ml-2">Today</button>
        </div>
        <button
          onClick={() => setBacklogOpen(true)}
          className="flex items-center gap-1.5 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
        >
          <Archive size={15} />
          Backlog
        </button>
      </div>

      {/* Columns */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd} onDragStart={e => setActiveCard(tasks.find(t => t.id === e.active.id) || null)}>
        <div ref={scrollRef} className="flex flex-1 overflow-x-auto overflow-y-hidden min-w-0">
          {weekDays.map((day, i) => (
            <DayColumn
              key={dateStrings[i]}
              date={day}
              dateStr={dateStrings[i]}
              tasks={tasks.filter(t => t.scheduledDate === dateStrings[i] && !t.isArchived && t.parentTaskId === null)}
              events={weekEvents.filter(e => e.startDatetime.slice(0, 10) === dateStrings[i])}
              loading={loading}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <TaskCard task={activeCard} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      {activeTaskId && <TaskDetailPanel />}
    </div>
  )
}
