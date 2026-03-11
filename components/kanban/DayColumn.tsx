'use client'
import { useState, useRef, useEffect } from 'react'
import { format, isToday } from 'date-fns'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useAppStore } from '@/store/useAppStore'
import { Task } from '@/types'
import { cn, minutesToHours } from '@/lib/utils'
import { Plus } from 'lucide-react'
import TaskCard from '../task/TaskCard'

interface Props {
  date: Date
  dateStr: string
  tasks: Task[]
  loading: boolean
}

// Parses "30m", "1h", "1h30m" from end of title — e.g. "Review docs 30m"
function parseTimeFromTitle(raw: string): { title: string; minutes: number | null } {
  const match = raw.trim().match(/^(.+)\s+(\d+h\d+m|\d+h|\d+m)$/i)
  if (!match) return { title: raw.trim(), minutes: null }
  const timeStr = match[2]
  const h = timeStr.match(/(\d+)h/i)
  const m = timeStr.match(/(\d+)m/i)
  const total = (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0)
  return { title: match[1].trim(), minutes: total || null }
}

export default function DayColumn({ date, dateStr, tasks, loading }: Props) {
  const { isOver, setNodeRef } = useDroppable({ id: dateStr })
  const { addTask } = useAppStore()
  const [addingTask, setAddingTask] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const today = isToday(date)
  const completed = tasks.filter(t => t.status === 'complete').length
  const total = tasks.length
  const progress = total === 0 ? 0 : (completed / total) * 100
  const plannedMinutes = tasks.reduce((sum, t) => sum + (t.plannedTimeMinutes || 0), 0)

  // Preview parsed time while typing
  const preview = parseTimeFromTitle(newTitle)

  useEffect(() => {
    if (addingTask) inputRef.current?.focus()
  }, [addingTask])

  function cancel() {
    setAddingTask(false)
    setNewTitle('')
  }

  async function handleAddTask(e?: React.FormEvent) {
    e?.preventDefault()
    if (!newTitle.trim()) { cancel(); return }
    const { title, minutes } = parseTimeFromTitle(newTitle)
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        scheduledDate: dateStr,
        sortOrder: tasks.length,
        plannedTimeMinutes: minutes,
      }),
    })
    const task: Task = await res.json()
    addTask(task)
    cancel()
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col min-w-[220px] w-[220px] border-r border-stone-200 dark:border-stone-800 h-full',
        today ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : 'bg-white dark:bg-stone-900',
        isOver && 'bg-indigo-50 dark:bg-indigo-950/30'
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
          {plannedMinutes > 0 && (
            <span className="text-xs text-stone-400">{minutesToHours(plannedMinutes)}</span>
          )}
        </div>
        <div className="h-1 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {loading ? (
            <div className="space-y-1.5">
              {[1, 2].map(i => (
                <div key={i} className="h-12 bg-stone-100 dark:bg-stone-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            tasks.map(task => <TaskCard key={task.id} task={task} />)
          )}
        </SortableContext>

        {/* Add task */}
        {addingTask ? (
          <form onSubmit={handleAddTask} className="mt-1">
            <input
              ref={inputRef}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && cancel()}
              placeholder="Task name… or add 30m / 1h"
              className="w-full text-sm px-2 py-1.5 rounded border border-indigo-400 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none"
            />
            {preview.minutes && (
              <p className="text-xs text-indigo-500 mt-0.5 px-1">
                ⏱ {minutesToHours(preview.minutes)} estimated · "{preview.title}"
              </p>
            )}
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
      </div>
    </div>
  )
}
