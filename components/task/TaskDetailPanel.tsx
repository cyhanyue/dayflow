'use client'
import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Task } from '@/types'
import { X, Trash2, Clock, Calendar, AlignLeft, Plus, Check, Repeat } from 'lucide-react'
import { cn, minutesToHours } from '@/lib/utils'
import { format, parseISO } from 'date-fns'

export default function TaskDetailPanel() {
  const { activeTaskId, setActiveTaskId, tasks, updateTask, removeTask, channels, addTask } = useAppStore()
  const [task, setTask] = useState<Task | null>(null)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [newSubtask, setNewSubtask] = useState('')

  useEffect(() => {
    if (!activeTaskId) return
    const t = tasks.find(t => t.id === activeTaskId)
    if (t) {
      setTask(t)
      setTitle(t.title)
      setNotes(t.notes || '')
    }
  }, [activeTaskId, tasks])

  if (!activeTaskId || !task) return null

  async function save(updates: Partial<Task>) {
    if (!task) return
    updateTask(task.id, updates)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
  }

  async function handleDelete() {
    if (!task) return
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    removeTask(task.id)
    setActiveTaskId(null)
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault()
    if (!newSubtask.trim() || !task) return
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newSubtask.trim(), parentTaskId: task.id, scheduledDate: task.scheduledDate }),
    })
    const subtask: Task = await res.json()
    addTask(subtask)
    updateTask(task.id, { subtasks: [...(task.subtasks || []), subtask] })
    setNewSubtask('')
  }

  const subtasks = task.subtasks || []

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 shadow-xl flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
        <span className="text-sm font-medium text-stone-500">Task Detail</span>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} className="p-1 text-stone-400 hover:text-red-500 transition-colors">
            <Trash2 size={15} />
          </button>
          <button onClick={() => setActiveTaskId(null)} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => title !== task.title && save({ title })}
          className="w-full text-base font-medium bg-transparent border-none outline-none text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
          placeholder="Task title"
        />

        {/* Channel */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-400 w-20">Channel</span>
          <select
            value={task.channelId || ''}
            onChange={e => save({ channelId: e.target.value || null })}
            className="flex-1 text-sm bg-transparent border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">No channel</option>
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        </div>

        {/* Planned time */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-400 w-20 flex items-center gap-1"><Clock size={12} />Planned</span>
          <input
            type="number" min={0} step={5}
            value={task.plannedTimeMinutes || ''}
            onChange={e => save({ plannedTimeMinutes: parseInt(e.target.value) || null })}
            placeholder="minutes"
            className="w-24 text-sm bg-transparent border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {task.plannedTimeMinutes && <span className="text-xs text-stone-400">{minutesToHours(task.plannedTimeMinutes)}</span>}
        </div>

        {/* Actual time */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-400 w-20 flex items-center gap-1"><Clock size={12} />Actual</span>
          <input
            type="number" min={0} step={5}
            value={task.actualTimeMinutes || ''}
            onChange={e => save({ actualTimeMinutes: parseInt(e.target.value) || null })}
            placeholder="minutes"
            className="w-24 text-sm bg-transparent border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {task.actualTimeMinutes && <span className="text-xs text-stone-400">{minutesToHours(task.actualTimeMinutes)}</span>}
        </div>

        {/* Dates */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-400 w-20 flex items-center gap-1"><Calendar size={12} />Due</span>
          <input
            type="date"
            value={task.dueDate || ''}
            onChange={e => save({ dueDate: e.target.value || null })}
            className="text-sm bg-transparent border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Repeat */}
        {(() => {
          const rule = task.isRecurring && task.recurrenceRule
            ? JSON.parse(task.recurrenceRule) as { freq: string; days?: number[]; dayOfMonth?: number }
            : { freq: 'none' }
          const WEEKDAYS = [
            { label: 'Mo', value: 1 }, { label: 'Tu', value: 2 }, { label: 'We', value: 3 },
            { label: 'Th', value: 4 }, { label: 'Fr', value: 5 }, { label: 'Sa', value: 6 }, { label: 'Su', value: 0 },
          ]
          return (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400 w-20 flex items-center gap-1"><Repeat size={12} />Repeat</span>
                <select
                  value={rule.freq}
                  onChange={e => {
                    const freq = e.target.value
                    if (freq === 'none') {
                      save({ isRecurring: false, recurrenceRule: null })
                    } else if (freq === 'daily') {
                      save({ isRecurring: true, recurrenceRule: JSON.stringify({ freq: 'daily' }) })
                    } else if (freq === 'weekly') {
                      const dow = task.scheduledDate ? new Date(task.scheduledDate + 'T00:00:00').getDay() : 1
                      save({ isRecurring: true, recurrenceRule: JSON.stringify({ freq: 'weekly', days: [dow] }) })
                    } else if (freq === 'monthly') {
                      const dom = task.scheduledDate ? parseInt(task.scheduledDate.split('-')[2]) : 1
                      save({ isRecurring: true, recurrenceRule: JSON.stringify({ freq: 'monthly', dayOfMonth: dom }) })
                    }
                  }}
                  className="flex-1 text-sm bg-transparent border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              {rule.freq === 'weekly' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400 w-20" />
                  <div className="flex gap-1">
                    {WEEKDAYS.map(({ label, value }) => {
                      const days = rule.days || []
                      const active = days.includes(value)
                      return (
                        <button
                          key={value}
                          onClick={() => {
                            const newDays = active ? days.filter(d => d !== value) : [...days, value]
                            if (newDays.length === 0) return
                            save({ isRecurring: true, recurrenceRule: JSON.stringify({ freq: 'weekly', days: newDays }) })
                          }}
                          className={cn(
                            'w-7 h-7 rounded text-xs font-medium transition-colors',
                            active
                              ? 'bg-indigo-500 text-white'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                          )}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {rule.freq === 'monthly' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400 w-20" />
                  <input
                    type="number" min={1} max={31}
                    value={rule.dayOfMonth ?? ''}
                    onChange={e => {
                      const dom = parseInt(e.target.value)
                      if (dom >= 1 && dom <= 31) {
                        save({ isRecurring: true, recurrenceRule: JSON.stringify({ freq: 'monthly', dayOfMonth: dom }) })
                      }
                    }}
                    className="w-16 text-sm bg-transparent border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-stone-400">day of month</span>
                </div>
              )}
            </>
          )
        })()}

        {/* Notes */}
        <div>
          <div className="flex items-center gap-1 mb-1 text-xs text-stone-400">
            <AlignLeft size={12} />
            Notes
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => notes !== task.notes && save({ notes })}
            placeholder="Add notes…"
            rows={4}
            className="w-full text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Subtasks */}
        <div>
          <p className="text-xs text-stone-400 mb-2">Subtasks</p>
          <div className="space-y-1.5">
            {subtasks.map(sub => (
              <div key={sub.id} className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const newStatus = sub.status === 'complete' ? 'incomplete' : 'complete'
                    await fetch(`/api/tasks/${sub.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: newStatus }),
                    })
                    updateTask(task.id, {
                      subtasks: subtasks.map(s => s.id === sub.id ? { ...s, status: newStatus } : s)
                    })
                  }}
                  className={cn(
                    'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                    sub.status === 'complete' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-stone-300 dark:border-stone-600'
                  )}
                >
                  {sub.status === 'complete' && <Check size={9} strokeWidth={3} />}
                </button>
                <span className={cn('text-sm text-stone-700 dark:text-stone-300', sub.status === 'complete' && 'line-through text-stone-400')}>
                  {sub.title}
                </span>
              </div>
            ))}
            <form onSubmit={addSubtask} className="flex items-center gap-2 mt-1">
              <Plus size={14} className="text-stone-400 flex-shrink-0" />
              <input
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                placeholder="Add subtask…"
                className="flex-1 text-sm bg-transparent border-none outline-none text-stone-700 dark:text-stone-300 placeholder:text-stone-400"
              />
            </form>
          </div>
        </div>

        {/* Timebox */}
        <div>
          <p className="text-xs text-stone-400 mb-2">Time block</p>
          {task.timeboxStart && task.timeboxEnd ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-stone-700 dark:text-stone-300">
                {format(parseISO(task.timeboxStart), 'MMM d, h:mm a')} – {format(parseISO(task.timeboxEnd), 'h:mm a')}
              </span>
              <button
                onClick={() => save({ timeboxStart: null, timeboxEnd: null })}
                className="text-xs text-red-400 hover:text-red-600"
              >Remove</button>
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                type="datetime-local"
                onChange={async e => {
                  if (!e.target.value) return
                  const start = new Date(e.target.value)
                  const end = new Date(start.getTime() + (task.plannedTimeMinutes || 30) * 60000)
                  await save({ timeboxStart: start.toISOString(), timeboxEnd: end.toISOString() })
                }}
                className="text-xs bg-transparent border border-stone-200 dark:border-stone-700 rounded px-2 py-1 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-xs text-stone-400">({task.plannedTimeMinutes || 30}m)</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-4 py-3 border-t border-stone-100 dark:border-stone-800 flex gap-2 flex-wrap">
        <button
          onClick={() => save({ scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) })}
          className="text-xs px-2 py-1 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
        >
          Defer to tomorrow
        </button>
        <button
          onClick={() => { save({ isBacklog: true, scheduledDate: null }); setActiveTaskId(null) }}
          className="text-xs px-2 py-1 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
        >
          Move to backlog
        </button>
      </div>
    </div>
  )
}
