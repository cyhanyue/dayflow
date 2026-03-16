'use client'
import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import LeftSidebar from './LeftSidebar'
import RightSidebar from './RightSidebar'
import FloatingTimer from '../task/FloatingTimer'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { setUser, setChannels, setContexts, setCalendars, user } = useAppStore()

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
      fetch('/api/channels').then(r => r.ok ? r.json() : []),
      fetch('/api/contexts').then(r => r.ok ? r.json() : []),
      fetch('/api/calendars').then(r => r.ok ? r.json() : []),
    ]).then(([u, channels, contexts, calendars]) => {
      if (u) {
        setUser(u)
        // Auto-sync calendars in background if connected
        if (u.googleConnected) {
          fetch('/api/calendars/google/sync', { method: 'POST' }).catch(() => {})
        }
        if (u.icalConnected) {
          fetch('/api/calendars/ical/sync', { method: 'POST' }).catch(() => {})
        }
      }
      setChannels(channels ?? [])
      setContexts(contexts ?? [])
      setCalendars(calendars ?? [])
    }).catch(err => console.error('Failed to load app data:', err))
  }, [setUser, setChannels, setContexts, setCalendars])

  useEffect(() => {
    if (user?.theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [user?.theme])

  return (
    <div className="flex h-screen overflow-hidden bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <LeftSidebar />
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {children}
      </main>
      <RightSidebar />
      <FloatingTimer />
    </div>
  )
}
