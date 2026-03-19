'use client'
import { useEffect, useState } from 'react'
import { Pause, Play, Square } from 'lucide-react'

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

function getColors(mins: number, progress: number) {
  if (mins >= 45) {
    const intensity = Math.min(1, (mins - 45) / 30)
    const r = Math.round(220 + intensity * 15)
    const g = Math.round(38 - intensity * 20)
    const b = Math.round(38 - intensity * 20)
    return {
      bg: `linear-gradient(135deg, rgb(${r},${Math.max(0, g)},${Math.max(0, b)}), rgb(${Math.max(180, r - 20)},20,20))`,
      text: 'white', sub: 'rgba(255,255,255,0.75)', divider: 'rgba(255,255,255,0.3)',
      timer: '#fff', btn: 'rgba(255,255,255,0.2)', bar: 'rgba(255,255,255,0.4)', barBg: 'rgba(255,255,255,0.15)',
    }
  }
  const t = Math.min(1, progress)
  const r = Math.round(186 - t * 156)
  const g = Math.round(230 - t * 150)
  const b = Math.round(253 - t * 60)
  return {
    bg: `linear-gradient(135deg, rgb(${r},${g},${b}), rgb(${Math.max(0, r - 30)},${Math.max(0, g - 40)},${Math.min(255, b + 10)}))`,
    text: t > 0.5 ? 'white' : '#1e3a8a',
    sub: t > 0.5 ? 'rgba(255,255,255,0.75)' : 'rgba(30,58,138,0.65)',
    divider: t > 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(30,58,138,0.2)',
    timer: t > 0.5 ? '#fff' : '#1e3a8a',
    btn: t > 0.5 ? 'rgba(255,255,255,0.2)' : 'rgba(30,58,138,0.12)',
    bar: t > 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(30,58,138,0.4)',
    barBg: t > 0.5 ? 'rgba(255,255,255,0.15)' : 'rgba(30,58,138,0.1)',
  }
}

interface TimerState {
  active: boolean
  paused: boolean
  elapsed: number
  title: string
  plannedMins: number | null
}

function sendAction(action: string) {
  const ch = new BroadcastChannel('dayflow-timer')
  ch.postMessage({ type: 'TIMER_ACTION', action })
  ch.close()
}

export default function PopoutTimer() {
  const [state, setState] = useState<TimerState>({
    active: false, paused: false, elapsed: 0, title: '', plannedMins: null,
  })

  useEffect(() => {
    const ch = new BroadcastChannel('dayflow-timer')
    ch.onmessage = (e) => {
      if (e.data?.type === 'TIMER_STATE') setState(e.data)
    }
    return () => ch.close()
  }, [])

  // Update window title
  useEffect(() => {
    if (!state.active || state.paused) { document.title = 'Dayflow Timer'; return }
    const mins = Math.floor(state.elapsed / 60)
    const secs = state.elapsed % 60
    document.title = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} ⏱`
  }, [state])

  if (!state.active) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#1c1c1e', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: 'system-ui, sans-serif',
      }}>
        No active timer
      </div>
    )
  }

  const { elapsed, title, plannedMins, paused } = state
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const progress = plannedMins ? elapsed / (plannedMins * 60) : mins / 45
  const colors = getColors(mins, progress)
  const emoji = getEmoji(mins, plannedMins)
  const message = getMessage(mins, plannedMins)
  const elapsedStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  const plannedStr = plannedMins
    ? plannedMins >= 60 ? `${Math.floor(plannedMins / 60)}h${plannedMins % 60 > 0 ? `${plannedMins % 60}m` : ''}` : `${plannedMins}m`
    : null

  if (paused) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#3a3a3c', fontFamily: 'system-ui, sans-serif', gap: 8, cursor: 'pointer',
      }} onClick={() => sendAction('resume')}>
        <Play size={13} fill="currentColor" color="#4ade80" />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Paused</span>
        <span style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>{title}</span>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      {/* Main bar */}
      <div style={{
        background: colors.bg, transition: 'background 2s ease',
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
        height: plannedStr ? 'calc(100% - 3px)' : '100%',
      }}>
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: colors.sub }}>{message}</div>
        </div>

        <div style={{ width: 1, height: 32, background: colors.divider, flexShrink: 0 }} />

        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 18, color: colors.timer, lineHeight: 1.1 }}>
            {elapsedStr}
          </div>
          {plannedStr && <div style={{ fontSize: 11, color: colors.sub, textAlign: 'center' }}>/ {plannedStr}</div>}
        </div>

        {/* Pause */}
        <button
          onClick={() => sendAction('pause')}
          title="Pause"
          style={{ flexShrink: 0, background: colors.btn, border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: colors.timer }}
        >
          <Pause size={11} fill="currentColor" />
        </button>

        {/* Stop */}
        <button
          onClick={() => sendAction('stop')}
          title="Stop and save time"
          style={{ flexShrink: 0, background: colors.btn, border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: colors.timer }}
        >
          <Square size={12} fill="currentColor" />
        </button>
      </div>

      {/* Progress bar */}
      {plannedStr && (
        <div style={{ height: 3, background: colors.barBg }}>
          <div style={{ height: '100%', background: colors.bar, width: `${Math.min(100, progress * 100)}%`, transition: 'width 1s linear' }} />
        </div>
      )}
    </div>
  )
}
