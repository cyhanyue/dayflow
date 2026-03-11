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

export default function DayColumn({ date, dateStr, tasks, loading }: Props) {
  const { isOver, setNodeRef } = useDroppable({ id: dateStr })
  const { addTask } = useAppStore()
  const [addingTask, setAddingTask] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newMinutes, setNewMinutes] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const today = isToday(date)
  const completed = tasks.filter(t => t.status === 'complete').length
  const total = tasks.length
  const progress = total === 0 ? 0 : (completed / total) * 100
  const plannedMinutes = tasks.reduce((sum, t) => sum + (t.plannedTimeMinutes || 0), 0)

  useEffect(() => {
    if (addingTask) inputRef.current?.focus()
  }, [addingTask])

  function cancel() {
    setAddingTask(false)
    setNewTitle('')
    setNewMinutes('')
  }

  async function handleAddTask(e?: React.FormEvent) {
    e?.preventDefault()
    if (!newTitle.trim()) { cancel(); return }
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle.trim(),
        scheduledDate: dateStr,
        sortOrder: tasks.length,
        plannedTimeMinutes: newMinutes ? parseInt(newMinutes) : null,
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

        {/* Add task form */}
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
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={newMinutes}
                onChange={e => setNewMinutes(e.target.value)}
                placeholder="Est. mins (optional)"
                className="flex-1 text-xs px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-400 focus:outline-none focus:border-indigo-400"
              />
              <button
                type="submit"
                className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={cancel}
                className="text-xs px-2 py-1 text-stone-400 hover:text-stone-600 transition-colors"
              >
                ✕
              </button>
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
      </div>
    </div>
  )
}
