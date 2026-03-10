'use client'
import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Pause } from 'lucide-react'

export default function FloatingTimer() {
  const { activeTimerTaskId, timerStartedAt, stopTimer, tasks, updateTask } = useAppStore()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!activeTimerTaskId || !timerStartedAt) { setElapsed(0); return }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timerStartedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [activeTimerTaskId, timerStartedAt])

  if (!activeTimerTaskId) return null

  const task = tasks.find(t => t.id === activeTimerTaskId)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  async function handleStop() {
    if (!activeTimerTaskId || !timerStartedAt) return
    const durationMinutes = Math.round((Date.now() - timerStartedAt) / 60000)
    const task = tasks.find(t => t.id === activeTimerTaskId)
    const newActual = (task?.actualTimeMinutes || 0) + durationMinutes
    updateTask(activeTimerTaskId, { actualTimeMinutes: newActual })
    await fetch(`/api/tasks/${activeTimerTaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actualTimeMinutes: newActual }),
    })
    stopTimer()
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-stone-900 dark:bg-stone-800 text-white px-4 py-2.5 rounded-full shadow-lg border border-stone-700">
      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      <span className="text-sm font-medium truncate max-w-[180px]">{task?.title || 'Task'}</span>
      <span className="text-sm font-mono tabular-nums">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span>
      <button onClick={handleStop} className="p-1 hover:bg-stone-700 rounded-full transition-colors">
        <Pause size={14} />
      </button>
    </div>
  )
}
