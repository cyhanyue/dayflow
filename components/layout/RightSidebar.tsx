'use client'
import { useAppStore } from '@/store/useAppStore'
import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { Task } from '@/types'
import TaskCard from '../task/TaskCard'

export default function RightSidebar() {
  const { isBacklogOpen, setBacklogOpen, tasks, setTasks, calendars, setCalendars } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const backlogTasks = tasks.filter(t => t.isBacklog && !t.isArchived)

  useEffect(() => {
    if (isBacklogOpen) {
      setLoading(true)
      fetch('/api/tasks?backlog=true')
        .then(r => r.json())
        .then(data => {
          setTasks([...tasks.filter(t => !t.isBacklog), ...data])
          setLoading(false)
        })
    }
  }, [isBacklogOpen])

  async function addBacklogTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim(), isBacklog: true }),
    })
    const task: Task = await res.json()
    setTasks([...tasks, task])
    setNewTitle('')
  }

  if (!isBacklogOpen) return null

  return (
    <aside className={cn('w-72 flex-shrink-0 flex flex-col border-l border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 h-full')}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
        <span className="font-medium text-sm">Backlog</span>
        <button onClick={() => setBacklogOpen(false)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={addBacklogTask} className="px-3 py-2 border-b border-stone-100 dark:border-stone-800">
        <div className="flex gap-2">
          <input
            value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Add to backlog…"
            className="flex-1 text-sm px-2 py-1.5 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button type="submit" className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700">
            <Plus size={14} />
          </button>
        </div>
      </form>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <p className="text-sm text-stone-400 text-center py-4">Loading…</p>
        ) : backlogTasks.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-4">Backlog is empty</p>
        ) : (
          backlogTasks.map(task => <TaskCard key={task.id} task={task} />)
        )}
      </div>

      {/* Calendar toggles */}
      <div className="border-t border-stone-100 dark:border-stone-800 p-3">
        <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Calendars</p>
        {calendars.map(cal => (
          <label key={cal.id} className="flex items-center gap-2 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={cal.isVisible}
              onChange={async e => {
                await fetch(`/api/calendars/${cal.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ isVisible: e.target.checked }),
                })
                setCalendars(calendars.map(c => c.id === cal.id ? { ...c, isVisible: e.target.checked } : c))
              }}
              className="rounded"
            />
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cal.color }} />
            <span className="text-sm text-stone-600 dark:text-stone-400">{cal.name}</span>
          </label>
        ))}
      </div>
    </aside>
  )
}
