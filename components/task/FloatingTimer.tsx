'use client'
import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Square } from 'lucide-react'

function getEmoji(mins: number, plannedMins: number | null) {
  if (plannedMins && mins >= plannedMins) return '🏁'
  if (mins >= 90) return '🧠'
  if (mins >= 45) return '⏰'
  if (mins >= 30) return '🔥'
  if (mins >= 15) return '⚡'
  return '🌱'
}

function getMessage(mins: number, plannedMins: number | null) {
  if (plannedMins && mins >= plannedMins) return 'Time\'s up!'
  if (mins >= 45) return 'Take a break soon'
  if (mins >= 30) return 'In the zone'
  if (mins >= 15) return 'Getting going'
  return 'Just started'
}

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
  const isOverdue = mins >= 45
  const emoji = getEmoji(mins, task?.plannedTimeMinutes ?? null)
  const message = getMessage(mins, task?.plannedTimeMinutes ?? null)

  async function handleStop() {
    if (!activeTimerTaskId || !timerStartedAt) return
    const durationMinutes = Math.round((Date.now() - timerStartedAt) / 60000)
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
    <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 shadow-xl rounded-2xl overflow-hidden transition-all duration-500 ${isOverdue ? 'shadow-pink-200' : 'shadow-pink-100'}`}>
      <div className={`flex items-center gap-3 px-5 py-3 ${isOverdue ? 'bg-gradient-to-r from-pink-500 to-rose-400' : 'bg-gradient-to-r from-pink-100 to-rose-50'}`}>
        {/* Emoji */}
        <span className="text-xl leading-none">{emoji}</span>

        {/* Task + status */}
        <div className="flex flex-col min-w-0">
          <span className={`text-sm font-semibold truncate max-w-[160px] ${isOverdue ? 'text-white' : 'text-rose-700'}`}>
            {task?.title || 'Task'}
          </span>
          <span className={`text-xs ${isOverdue ? 'text-pink-100' : 'text-rose-400'}`}>
            {message}
          </span>
        </div>

        {/* Divider */}
        <div className={`w-px h-8 ${isOverdue ? 'bg-pink-300' : 'bg-rose-200'}`} />

        {/* Timer */}
        <span className={`text-lg font-mono tabular-nums font-bold ${isOverdue ? 'text-white' : 'text-rose-600'}`}>
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </span>

        {/* Stop button */}
        <button
          onClick={handleStop}
          className={`p-1.5 rounded-full transition-colors ${isOverdue ? 'bg-pink-400 hover:bg-pink-300 text-white' : 'bg-rose-200 hover:bg-rose-300 text-rose-600'}`}
        >
          <Square size={13} fill="currentColor" />
        </button>
      </div>

      {/* Progress bar if planned time set */}
      {task?.plannedTimeMinutes && (
        <div className="h-1 bg-pink-100">
          <div
            className="h-full bg-rose-400 transition-all duration-1000"
            style={{ width: `${Math.min(100, (mins / task.plannedTimeMinutes) * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
