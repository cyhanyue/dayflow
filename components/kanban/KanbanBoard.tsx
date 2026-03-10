'use client'
import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { getWeekDays, formatDate } from '@/lib/utils'
import { addWeeks, subWeeks } from 'date-fns'
import DayColumn from './DayColumn'
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
import { Task } from '@/types'
import TaskCard from '../task/TaskCard'

export default function KanbanBoard() {
  const {
    tasks, setTasks, activeTaskId, currentWeekStart,
    setCurrentWeekStart, setBacklogOpen, updateTask,
  } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [activeCard, setActiveCard] = useState<Task | null>(null)

  const weekDays = getWeekDays(currentWeekStart)
  const dateStrings = weekDays.map(formatDate)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const loadTasks = useCallback(async () => {
    setLoading(true)
    const results = await Promise.all(
      dateStrings.map(date => fetch(`/api/tasks?date=${date}`).then(r => r.json()))
    )
    const allTasks = results.flat()
    setTasks(allTasks)
    setLoading(false)
  }, [dateStrings.join(','), setTasks])

  useEffect(() => { loadTasks() }, [loadTasks])

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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const taskId = active.id as string
    const targetDate = over.id as string
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.scheduledDate === targetDate) return

    updateTask(taskId, { scheduledDate: targetDate, isBacklog: false })
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledDate: targetDate, isBacklog: false }),
    })
    setActiveCard(null)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}
            className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
            {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
            {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button
            onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
            className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setCurrentWeekStart(new Date())}
            className="text-xs text-indigo-600 hover:underline ml-2"
          >Today</button>
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
        <div className="flex flex-1 overflow-x-auto overflow-y-hidden min-w-0">
          {weekDays.map((day, i) => (
            <DayColumn
              key={dateStrings[i]}
              date={day}
              dateStr={dateStrings[i]}
              tasks={tasks.filter(t => t.scheduledDate === dateStrings[i] && !t.isArchived && t.parentTaskId === null)}
              loading={loading}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <TaskCard task={activeCard} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Task detail panel */}
      {activeTaskId && <TaskDetailPanel />}
    </div>
  )
}
