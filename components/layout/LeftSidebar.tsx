'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Calendar, BarChart2, Settings, LogOut } from 'lucide-react'

const nav = [
  { href: '/app', icon: LayoutDashboard, label: 'Tasks' },
  { href: '/calendar', icon: Calendar, label: 'Calendar' },
  { href: '/analytics', icon: BarChart2, label: 'Analytics' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export default function LeftSidebar() {
  const pathname = usePathname()
  const { channels, activeContextId, setActiveContextId, contexts } = useAppStore()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 h-full">
      {/* App name */}
      <div className="px-4 py-4 border-b border-stone-100 dark:border-stone-800">
        <span className="font-semibold text-stone-900 dark:text-stone-100 text-sm">DayFlow</span>
      </div>

      {/* Nav */}
      <nav className="p-2 space-y-0.5">
        {nav.map(({ href, icon: Icon, label }) => (
          <Link
            key={href} href={href}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === href || (href !== '/app' && pathname.startsWith(href))
                ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

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

      {/* Logout */}
      <div className="p-2 border-t border-stone-100 dark:border-stone-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 w-full rounded-lg text-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
