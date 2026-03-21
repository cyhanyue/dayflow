'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { getWeekDays, formatDate } from '@/lib/utils'
import { addWeeks, subWeeks, isToday, parseISO } from 'date-fns'
import DayColumn, { buildMergedItems } from './DayColumn'
import TaskDetailPanel from '../task/TaskDetailPanel'
import { ChevronLeft, ChevronRight, Archive } from 'lucide-react'
import DailyBanner from './DailyBanner'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CalendarEvent, Task } from '@/types'
import TaskCard from '../task/TaskCard'

export default function KanbanBoard() {
  const {
    tasks, setTasks, activeTaskId, currentWeekStart,
    setCurrentWeekStart, setBacklogOpen, updateTask, syncKey,
  } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [activeCard, setActiveCard] = useState<Task | null>(null)
  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Show 3 weeks (current + next 2) so tasks can be dragged across week boundaries
  const weeks = [
    getWeekDays(currentWeekStart),
    getWeekDays(addWeeks(currentWeekStart, 1)),
    getWeekDays(addWeeks(currentWeekStart, 2)),
  ]
  const weekDays = weeks[0] // used for header display
  const allDays = weeks.flat()
  const allDateStrings = allDays.map(formatDate)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    const start = allDays[0]
    const end = new Date(allDays[allDays.length - 1])
    end.setHours(23, 59, 59, 999)

    const [taskResults, eventsRes] = await Promise.all([
      Promise.all(allDateStrings.map(date => fetch(`/api/tasks?date=${date}`).then(r => r.json()))),
      fetch(`/api/events?start=${start.toISOString()}&end=${end.toISOString()}`).then(r => r.ok ? r.json() : []),
    ])

    setTasks(taskResults.flat())
    setWeekEvents(eventsRes ?? [])
    setLoading(false)
  }, [allDateStrings.join(','), setTasks])

  // Re-load whenever week changes OR a background sync completes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadTasks() }, [loadTasks, syncKey])

  // Scroll today's column into view on mount
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const todayIndex = allDays.findIndex(d => isToday(d))
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

  function isInLoadedRange(dateStr: string) {
    return allDateStrings.includes(dateStr)
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

  function resolveTargetDate(overId: string): string | null {
    if (/^\d{4}-\d{2}-\d{2}$/.test(overId)) return overId
    const overTask = tasks.find(t => t.id === overId)
    if (overTask?.scheduledDate && isInLoadedRange(overTask.scheduledDate)) return overTask.scheduledDate
    const overEvent = weekEvents.find(e => e.id === overId)
    if (overEvent) return parseISO(overEvent.startDatetime).toISOString().slice(0, 10)
    return null
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event
    const date = over ? resolveTargetDate(over.id as string) : null
    setDragOverDate(date)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCard(null)
    setDragOverDate(null)
    if (!over) return

    const taskId = active.id as string
    const overId = over.id as string
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    const targetDate = resolveTargetDate(overId)
    if (!targetDate) return

    const isCrossColumn = task.scheduledDate !== targetDate

    // For cross-column drops onto a task, position after that task in the target column
    const isDropOnTask = !/^\d{4}-\d{2}-\d{2}$/.test(overId)

    if (isCrossColumn) {
      let newPos: number
      if (isDropOnTask) {
        const targetMerged = getMergedList(targetDate)
        const overIdx = targetMerged.findIndex(i => i.id === overId)
        if (overIdx === -1) {
          newPos = Date.now()
        } else {
          const after = targetMerged[overIdx + 1]
          newPos = after
            ? (targetMerged[overIdx].position + after.position) / 2
            : targetMerged[overIdx].position + 1000
        }
      } else {
        // Dropped on empty column area — append at end
        const targetMerged = getMergedList(targetDate)
        const last = [...targetMerged].reverse().find(i => i.type === 'task')
        newPos = last ? last.position + 1000 : 0
      }
      updateTask(taskId, { scheduledDate: targetDate, isBacklog: false, sortOrder: newPos })
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: targetDate, isBacklog: false, sortOrder: newPos }),
      })
      return
    }

    // Within-column reorder — only valid when dropping onto a task/event
    if (!isDropOnTask) return
    const newPos = calcNewPosition(targetDate, taskId, overId)
    updateTask(taskId, { sortOrder: newPos })
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sortOrder: newPos }),
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DailyBanner />
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
      <DndContext sensors={sensors} onDragStart={e => setActiveCard(tasks.find(t => t.id === e.active.id) || null)} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={() => { setActiveCard(null); setDragOverDate(null) }}>
        <div ref={scrollRef} className="flex flex-1 overflow-x-auto overflow-y-hidden min-w-0">
          {weeks.map((wDays, wi) => (
            <div key={wi} className="flex flex-shrink-0">
              {wi > 0 && (
                <div className="w-px flex-shrink-0 bg-stone-300 dark:bg-stone-700 self-stretch" />
              )}
              {wDays.map(day => {
                const dateStr = formatDate(day)
                return (
                  <DayColumn
                    key={dateStr}
                    date={day}
                    dateStr={dateStr}
                    tasks={tasks.filter(t => t.scheduledDate === dateStr && !t.isArchived && t.parentTaskId === null)}
                    events={weekEvents.filter(e => e.startDatetime.slice(0, 10) === dateStr)}
                    loading={loading}
                    isDragTarget={dragOverDate === dateStr}
                  />
                )
              })}
            </div>
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
