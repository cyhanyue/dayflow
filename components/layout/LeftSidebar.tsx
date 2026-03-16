'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Calendar, BarChart2, Settings, LogOut, Repeat, ChevronDown, ChevronRight, Pencil, Trash2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Task } from '@/types'

const nav = [
  { href: '/app', icon: LayoutDashboard, label: 'Home' },
  { href: '/calendar', icon: Calendar, label: 'Calendar' },
  { href: '/analytics', icon: BarChart2, label: 'Analytics' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

function ruleLabel(rule: string): string {
  try {
    const r = JSON.parse(rule) as { freq: string; days?: number[]; dayOfMonth?: number }
    if (r.freq === 'daily') return 'Daily'
    if (r.freq === 'weekly') {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      return (r.days ?? []).map(d => names[d]).join(', ')
    }
    if (r.freq === 'monthly') return `Monthly · ${r.dayOfMonth}`
  } catch { /* empty */ }
  return 'Recurring'
}

export default function LeftSidebar() {
  const pathname = usePathname()
  const { channels, activeContextId, setActiveContextId, contexts, tasks, setTasks, setActiveTaskId, addTask } = useAppStore()
  const [collapsed, setCollapsed] = useState(false)
  const [recurringOpen, setRecurringOpen] = useState(true)
  const [recurringTasks, setRecurringTasks] = useState<Task[]>([])
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRecurring() {
      const res = await fetch('/api/tasks?recurring=true')
      if (!res.ok) return
      const all: Task[] = await res.json()
      const seen = new Map<string, Task>()
      for (const t of all) {
        const key = `${t.title}|||${t.recurrenceRule}`
        const existing = seen.get(key)
        if (!existing || (t.scheduledDate ?? '') < (existing.scheduledDate ?? '')) seen.set(key, t)
      }
      setRecurringTasks(Array.from(seen.values()).sort((a, b) => a.title.localeCompare(b.title)))
    }
    fetchRecurring()
  }, [])

  function handleEdit(t: Task) {
    const inStore = tasks.find(s => s.id === t.id)
    if (!inStore) addTask(t)
    setActiveTaskId(t.id)
  }

  async function handleDelete(t: Task, scope: 'one' | 'future' | 'series') {
    const url = scope !== 'one' ? `/api/tasks/${t.id}?scope=${scope}` : `/api/tasks/${t.id}`
    await fetch(url, { method: 'DELETE' })
    if (scope === 'series') {
      setTasks(tasks.filter(s => !(s.isRecurring && s.title === t.title && s.recurrenceRule === t.recurrenceRule)))
      setRecurringTasks(prev => prev.filter(s => !(s.title === t.title && s.recurrenceRule === t.recurrenceRule)))
    } else if (scope === 'future') {
      setTasks(tasks.filter(s => !(s.isRecurring && s.title === t.title && s.recurrenceRule === t.recurrenceRule && (s.scheduledDate ?? '') >= (t.scheduledDate ?? ''))))
      setRecurringTasks(prev => prev.filter(s => !(s.title === t.title && s.recurrenceRule === t.recurrenceRule)))
    } else {
      setTasks(tasks.filter(s => s.id !== t.id))
      setRecurringTasks(prev => prev.filter(s => s.id !== t.id))
    }
    setDeleteTarget(null)
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <aside className={cn(
      'flex-shrink-0 flex flex-col border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 h-full transition-all duration-200',
      collapsed ? 'w-12' : 'w-56'
    )}>
      {/* Header row */}
      <div className={cn('flex items-center border-b border-stone-100 dark:border-stone-800', collapsed ? 'justify-center px-0 py-3' : 'justify-between px-4 py-4')}>
        {!collapsed && <span className="font-semibold text-stone-900 dark:text-stone-100 text-sm">DayFlow</span>}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="p-1 rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="p-2 space-y-0.5">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/app' && pathname.startsWith(href))
          return (
            <Link
              key={href} href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
              )}
            >
              <Icon size={16} />
              {!collapsed && label}
            </Link>
          )
        })}
      </nav>

      {/* Expanded content */}
      {!collapsed && (
        <>
          {/* Recurring tasks */}
          <div className="px-3 mt-3">
            <button
              onClick={() => setRecurringOpen(o => !o)}
              className="flex items-center gap-1.5 w-full px-1 mb-1 text-xs font-medium text-stone-400 uppercase tracking-wider hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
            >
              {recurringOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Repeat size={11} />
              Recurring
            </button>

            {recurringOpen && (
              <div className="space-y-0.5">
                {recurringTasks.length === 0 && (
                  <p className="text-xs text-stone-400 px-2 py-1">No recurring tasks</p>
                )}
                {recurringTasks.map(t => (
                  <div key={t.id}>
                    <div className="group flex items-center gap-1 px-2 py-1.5 rounded hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-stone-700 dark:text-stone-300 truncate">{t.title}</p>
                        {t.recurrenceRule && (
                          <p className="text-xs text-stone-400 truncate">{ruleLabel(t.recurrenceRule)}</p>
                        )}
                      </div>
                      <button onClick={() => handleEdit(t)} className="flex-shrink-0 p-0.5 text-stone-300 dark:text-stone-600 opacity-0 group-hover:opacity-100 hover:text-indigo-500 transition-all">
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => setDeleteTarget(deleteTarget === t.id ? null : t.id)} className="flex-shrink-0 p-0.5 text-stone-300 dark:text-stone-600 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all">
                        <Trash2 size={11} />
                      </button>
                    </div>
                    {deleteTarget === t.id && (
                      <div className="mx-2 mb-1 p-2 bg-stone-50 dark:bg-stone-800 rounded border border-stone-200 dark:border-stone-700 text-xs space-y-0.5">
                        <button onClick={() => handleDelete(t, 'one')} className="w-full text-left px-1.5 py-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-400 transition-colors">Delete this only</button>
                        <button onClick={() => handleDelete(t, 'future')} className="w-full text-left px-1.5 py-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-400 transition-colors">Delete this &amp; future</button>
                        <button onClick={() => handleDelete(t, 'series')} className="w-full text-left px-1.5 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 transition-colors">Delete entire series</button>
                        <button onClick={() => setDeleteTarget(null)} className="w-full text-left px-1.5 py-1 text-stone-400 hover:text-stone-600 transition-colors">Cancel</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contexts */}
          {contexts.length > 0 && (
            <div className="px-3 mt-4">
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2 px-1">Contexts</p>
              <button
                onClick={() => setActiveContextId(null)}
                className={cn('w-full text-left px-2 py-1.5 rounded text-sm transition-colors mb-0.5',
                  activeContextId === null ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100' : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                )}
              >All</button>
              {contexts.map(ctx => (
                <button
                  key={ctx.id}
                  onClick={() => setActiveContextId(ctx.id)}
                  className={cn('w-full text-left px-2 py-1.5 rounded text-sm transition-colors mb-0.5',
                    activeContextId === ctx.id ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100' : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                  )}
                >{ctx.name}</button>
              ))}
            </div>
          )}

          {/* Channels */}
          <div className="px-3 mt-4 flex-1 overflow-y-auto">
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2 px-1">Channels</p>
            {channels.map(ch => (
              <div key={ch.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ch.color }} />
                {ch.name}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Logout */}
      <div className={cn('p-2 border-t border-stone-100 dark:border-stone-800 mt-auto', collapsed && 'flex justify-center')}>
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign out' : undefined}
          className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors', collapsed && 'px-0 justify-center w-full')}
        >
          <LogOut size={16} />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
