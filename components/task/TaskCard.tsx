'use client'
import { useEffect, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Task } from '@/types'
import { useAppStore } from '@/store/useAppStore'
import { cn, minutesToHours } from '@/lib/utils'
import { Check, Play, Square, Repeat } from 'lucide-react'

interface Props {
  task: Task
  isDragging?: boolean
}

export default function TaskCard({ task, isDragging }: Props) {
  const {
    setActiveTaskId, updateTask,
    activeTimerTaskId, timerStartedAt, timerAccumulatedMs,
    startTimer, stopTimer,
  } = useAppStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } = useSortable({ id: task.id })
  const isTimerRunning = activeTimerTaskId === task.id
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isTimerRunning) { setElapsed(0); return }
    const tick = () => {
      const base = isTimerRunning ? timerAccumulatedMs : 0
      const live = timerStartedAt ? Date.now() - timerStartedAt : 0
      setElapsed(Math.floor((base + live) / 1000))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isTimerRunning, timerStartedAt, timerAccumulatedMs])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftColor: task.channel?.color || '#e2e8f0',
  }

  async function toggleComplete(e: React.MouseEvent) {
    e.stopPropagation()
    const newStatus = task.status === 'complete' ? 'incomplete' : 'complete'
    const completedAt = newStatus === 'complete' ? new Date().toISOString() : null
    updateTask(task.id, { status: newStatus, completedAt })
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, completedAt }),
    })
  }

  async function handleTimerStart(e: React.MouseEvent) {
    e.stopPropagation()
    startTimer(task.id, task.title)
  }

  const elapsedMins = Math.floor(elapsed / 60)
  const elapsedSecs = elapsed % 60
  const elapsedDisplay = `${String(elapsedMins).padStart(2, '0')}:${String(elapsedSecs).padStart(2, '0')}`

  void stopTimer // used in FloatingTimer, not here

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => setActiveTaskId(task.id)}
      className={cn(
        'group relative flex items-start gap-2 px-2.5 py-2 rounded-lg border text-sm cursor-pointer transition-all select-none',
        'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700',
        'hover:border-stone-300 dark:hover:border-stone-600 hover:shadow-sm',
        task.status === 'complete' && 'opacity-50',
        (isSortDragging || isDragging) && 'opacity-30 shadow-lg',
        'border-l-[3px]',
        isTimerRunning && 'ring-1 ring-red-400',
      )}
    >
      <button
        onClick={toggleComplete}
        className={cn(
          'flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
          task.status === 'complete'
            ? 'bg-pink-300 border-pink-300 text-white'
            : 'border-stone-300 dark:border-stone-600 hover:border-pink-300'
        )}
      >
        {task.status === 'complete' && <Check size={10} strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={cn('text-stone-800 dark:text-stone-200 leading-snug break-words', task.status === 'complete' && 'line-through text-stone-400')}>
          {task.title}
          {task.isRecurring && <Repeat size={12} className="inline ml-1 text-stone-400" />}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-stone-400">
          {isTimerRunning && (
            <span className="font-mono text-red-500 tabular-nums">{elapsedDisplay}</span>
          )}
          {task.plannedTimeMinutes && (
            <span>{minutesToHours(task.plannedTimeMinutes)}</span>
          )}
          {task.actualTimeMinutes && task.plannedTimeMinutes && !isTimerRunning && (
            <span className="text-stone-300 dark:text-stone-600">· {minutesToHours(task.actualTimeMinutes)} used</span>
          )}
        </div>
      </div>

      {task.status !== 'complete' && !isTimerRunning && (
        <button
          onClick={handleTimerStart}
          className="flex-shrink-0 p-1 rounded transition-all text-stone-300 dark:text-stone-600 opacity-0 group-hover:opacity-100 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
        >
          <Play size={11} fill="currentColor" />
        </button>
      )}
    </div>
  )
}
