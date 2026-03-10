'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Task } from '@/types'
import { useAppStore } from '@/store/useAppStore'
import { cn, minutesToHours } from '@/lib/utils'
import { Check, Clock } from 'lucide-react'

interface Props {
  task: Task
  isDragging?: boolean
}

export default function TaskCard({ task, isDragging }: Props) {
  const { setActiveTaskId, updateTask } = useAppStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } = useSortable({ id: task.id })

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
      )}
    >
      {/* Complete button */}
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

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-stone-800 dark:text-stone-200 truncate leading-snug', task.status === 'complete' && 'line-through text-stone-400')}>
          {task.title}
        </p>
        {task.plannedTimeMinutes && (
          <div className="flex items-center gap-1 mt-0.5 text-xs text-stone-400">
            <Clock size={10} />
            {minutesToHours(task.plannedTimeMinutes)}
          </div>
        )}
      </div>
    </div>
  )
}
