'use client'
import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import LeftSidebar from './LeftSidebar'
import RightSidebar from './RightSidebar'
import FloatingTimer from '../task/FloatingTimer'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { setUser, setChannels, setContexts, setCalendars, user } = useAppStore()

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(u => setUser(u))
    fetch('/api/channels').then(r => r.json()).then(setChannels)
    fetch('/api/contexts').then(r => r.json()).then(setContexts)
    fetch('/api/calendars').then(r => r.json()).then(setCalendars)
  }, [setUser, setChannels, setContexts, setCalendars])

  // Apply theme
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
