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
  const { setActiveTaskId, updateTask, activeTimerTaskId, timerStartedAt, startTimer, stopTimer } = useAppStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } = useSortable({ id: task.id })
  const isTimerRunning = activeTimerTaskId === task.id
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isTimerRunning || !timerStartedAt) { setElapsed(0); return }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timerStartedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [isTimerRunning, timerStartedAt])

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

  async function handleTimerToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (isTimerRunning) {
      const durationMinutes = Math.round((Date.now() - (timerStartedAt ?? Date.now())) / 60000)
      const newActual = (task.actualTimeMinutes || 0) + durationMinutes
      updateTask(task.id, { actualTimeMinutes: newActual })
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualTimeMinutes: newActual }),
      })
      stopTimer()
    } else {
      startTimer(task.id)
    }
  }

  const elapsedMins = Math.floor(elapsed / 60)
  const elapsedSecs = elapsed % 60
  const elapsedDisplay = `${String(elapsedMins).padStart(2, '0')}:${String(elapsedSecs).padStart(2, '0')}`

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
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-stone-300 dark:border-stone-600 hover:border-emerald-400'
        )}
      >
        {task.status === 'complete' && <Check size={10} strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={cn('text-stone-800 dark:text-stone-200 truncate leading-snug flex items-center gap-1', task.status === 'complete' && 'line-through text-stone-400')}>
          {task.title}
          {task.isRecurring && <Repeat size={12} className="flex-shrink-0 text-stone-400" />}
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

      {task.status !== 'complete' && (
        <button
          onClick={handleTimerToggle}
          className={cn(
            'flex-shrink-0 p-1 rounded transition-all',
            isTimerRunning
              ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
              : 'text-stone-300 dark:text-stone-600 opacity-0 group-hover:opacity-100 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
          )}
        >
          {isTimerRunning
            ? <Square size={11} fill="currentColor" />
            : <Play size={11} fill="currentColor" />
          }
        </button>
      )}
    </div>
  )
}
