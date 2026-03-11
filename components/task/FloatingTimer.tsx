'use client'
import { useEffect, useRef, useState } from 'react'
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
  if (plannedMins && mins >= plannedMins) return "Time's up!"
  if (mins >= 45) return 'Take a break soon'
  if (mins >= 30) return 'In the zone'
  if (mins >= 15) return 'Getting going'
  return 'Just started'
}

// Interpolate between light-blue → deep-blue → deep-red based on progress (0–1+)
function getColors(mins: number, progress: number) {
  if (mins >= 45) {
    // Deep red
    const intensity = Math.min(1, (mins - 45) / 30)
    const r = Math.round(220 + intensity * 15)
    const g = Math.round(38 - intensity * 20)
    const b = Math.round(38 - intensity * 20)
    return {
      bg: `linear-gradient(135deg, rgb(${r},${Math.max(0,g)},${Math.max(0,b)}), rgb(${Math.max(180,r-20)},20,20))`,
      text: 'text-white',
      sub: 'rgba(255,255,255,0.75)',
      divider: 'rgba(255,255,255,0.3)',
      timer: '#fff',
      btn: 'rgba(255,255,255,0.2)',
      btnHover: 'rgba(255,255,255,0.35)',
      bar: 'rgba(255,255,255,0.4)',
      barBg: 'rgba(255,255,255,0.15)',
    }
  }
  // Light blue → deep blue (0 → 45 min)
  const t = Math.min(1, progress)
  const r = Math.round(186 - t * 156)   // 186 → 30
  const g = Math.round(230 - t * 150)   // 230 → 80
  const b = Math.round(253 - t * 60)    // 253 → 193
  return {
    bg: `linear-gradient(135deg, rgb(${r},${g},${b}), rgb(${Math.max(0,r-30)},${Math.max(0,g-40)},${Math.min(255,b+10)}))`,
    text: t > 0.5 ? 'text-white' : 'text-blue-900',
    sub: t > 0.5 ? 'rgba(255,255,255,0.75)' : 'rgba(30,58,138,0.65)',
    divider: t > 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(30,58,138,0.2)',
    timer: t > 0.5 ? '#fff' : '#1e3a8a',
    btn: t > 0.5 ? 'rgba(255,255,255,0.2)' : 'rgba(30,58,138,0.12)',
    btnHover: 'rgba(255,255,255,0.35)',
    bar: t > 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(30,58,138,0.4)',
    barBg: t > 0.5 ? 'rgba(255,255,255,0.15)' : 'rgba(30,58,138,0.1)',
  }
}

export default function FloatingTimer() {
  const { activeTimerTaskId, timerStartedAt, stopTimer, tasks, updateTask } = useAppStore()
  const [elapsed, setElapsed] = useState(0)

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const timerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activeTimerTaskId || !timerStartedAt) { setElapsed(0); return }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timerStartedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [activeTimerTaskId, timerStartedAt])

  // Set default position on first mount
  useEffect(() => {
    if (!pos && typeof window !== 'undefined') {
      setPos({ x: window.innerWidth / 2 - 180, y: window.innerHeight - 80 })
    }
  }, [pos])

  function onMouseDown(e: React.MouseEvent) {
    if (!timerRef.current) return
    dragging.current = true
    const rect = timerRef.current.getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 360, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragOffset.current.y)),
      })
    }
    function onMouseUp() { dragging.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [])

  if (!activeTimerTaskId) return null

  const task = tasks.find(t => t.id === activeTimerTaskId)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const planned = task?.plannedTimeMinutes ?? null
  const progress = planned ? elapsed / (planned * 60) : mins / 45
  const colors = getColors(mins, progress)
  const emoji = getEmoji(mins, planned)
  const message = getMessage(mins, planned)

  // Elapsed display
  const elapsedStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  // Planned display
  const plannedStr = planned
    ? planned >= 60
      ? `${Math.floor(planned / 60)}h${planned % 60 > 0 ? `${planned % 60}m` : ''}`
      : `${planned}m`
    : null

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
    <div
      ref={timerRef}
      style={{
        position: 'fixed',
        left: pos?.x ?? '50%',
        top: pos?.y ?? undefined,
        bottom: pos ? undefined : 20,
        transform: pos ? undefined : 'translateX(-50%)',
        zIndex: 9999,
        width: 360,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        transition: 'box-shadow 0.5s',
        userSelect: 'none',
      }}
    >
      {/* Main bar */}
      <div
        onMouseDown={onMouseDown}
        style={{ background: colors.bg, transition: 'background 2s ease', cursor: 'grab', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
      >
        {/* Emoji */}
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>

        {/* Task + status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={`text-sm font-semibold truncate ${colors.text}`}>{task?.title || 'Task'}</div>
          <div style={{ fontSize: 11, color: colors.sub }}>{message}</div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 32, background: colors.divider, flexShrink: 0 }} />

        {/* Time: elapsed / planned */}
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 18, color: colors.timer, lineHeight: 1.1, tabularNums: true } as React.CSSProperties}>
            {elapsedStr}
          </div>
          {plannedStr && (
            <div style={{ fontSize: 11, color: colors.sub, textAlign: 'center' }}>/ {plannedStr}</div>
          )}
        </div>

        {/* Stop button */}
        <button
          onClick={handleStop}
          onMouseDown={e => e.stopPropagation()}
          style={{ flexShrink: 0, background: colors.btn, border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: colors.timer, transition: 'background 0.2s' }}
        >
          <Square size={12} fill="currentColor" />
        </button>
      </div>

      {/* Progress bar */}
      {planned && (
        <div style={{ height: 3, background: colors.barBg }}>
          <div
            style={{
              height: '100%',
              background: colors.bar,
              width: `${Math.min(100, progress * 100)}%`,
              transition: 'width 1s linear, background 2s ease',
            }}
          />
        </div>
      )}
    </div>
  )
}
