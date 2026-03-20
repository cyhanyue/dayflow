'use client'
import { useEffect, useRef, useState } from 'react'
import { Minus, Pause, Play, Square } from 'lucide-react'

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

interface ApiState {
  active: boolean
  paused: boolean
  timerStartedAt: number | null
  timerAccumulatedMs: number
  title: string
  plannedMins: number | null
}

// Send timer action (pause/resume/stop) via BroadcastChannel + API
function sendAction(action: string) {
  try {
    const ch = new BroadcastChannel('dayflow-timer')
    ch.postMessage({ type: 'TIMER_ACTION', action })
    ch.close()
  } catch {}
  fetch('/api/timer-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  }).catch(() => {})
}

// Minimize/hide the floatie window
function minimize() {
  const webkit = (window as any).webkit
  if (webkit?.messageHandlers?.floatie) {
    webkit.messageHandlers.floatie.postMessage({ action: 'minimize' })
  } else {
    window.close()
  }
}

// Open a URL — reuse existing named window so Dayflow isn't opened twice
function openURL(url: string) {
  const webkit = (window as any).webkit
  if (webkit?.messageHandlers?.floatie) {
    webkit.messageHandlers.floatie.postMessage({ action: 'open', url })
  } else {
    window.open(url, 'dayflow-main')
  }
}

const idleMessages = [
  { emoji: '🌱', text: 'Ready to grow?' },
  { emoji: '✨', text: 'Time to do great things' },
  { emoji: '🚀', text: 'Ready when you are' },
  { emoji: '🎯', text: "Let's get focused" },
  { emoji: '⚡', text: 'Energy charged. Go!' },
]

function InactiveState() {
  const { emoji, text } = idleMessages[Math.floor(Date.now() / 60000) % idleMessages.length]

  return (
    <>
      <style>{`
        @keyframes idle-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.7; transform: scale(0.92); }
        }
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: scaleY(1);   opacity: 0.5; }
          40%            { transform: scaleY(1.4); opacity: 1; }
        }
        .open-btn:hover { background: rgba(99,179,237,0.25) !important; }
        .open-btn       { transition: background 0.15s; }
      `}</style>
      <div style={{
        width: '100vw', height: '100vh',
        background: 'linear-gradient(135deg,#1a1a2e 0%,#1e2a45 100%)',
        display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 10,
        fontFamily: 'system-ui, sans-serif', overflow: 'hidden', boxSizing: 'border-box',
      }}>
        {/* Animated emoji */}
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, animation: 'idle-pulse 2.8s ease-in-out infinite' }}>
          {emoji}
        </span>

        {/* Text + bouncing dots */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {text}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, marginTop: 3, height: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 4, height: 4, borderRadius: '50%', background: '#63b3ed',
                animation: `dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        </div>

        {/* Open Dayflow button */}
        <button
          className="open-btn"
          onClick={() => openURL('http://localhost:3001/app')}
          style={{
            background: 'rgba(99,179,237,0.15)', border: '1px solid rgba(99,179,237,0.3)',
            borderRadius: 14, padding: '4px 10px', color: '#63b3ed',
            fontSize: 10, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
          }}
        >
          Open <span style={{ fontSize: 11 }}>↗</span>
        </button>
      </div>
    </>
  )
}

export default function PopoutTimer() {
  const [apiState, setApiState] = useState<ApiState>({
    active: false, paused: false, timerStartedAt: null,
    timerAccumulatedMs: 0, title: '', plannedMins: null,
  })
  const [elapsed, setElapsed] = useState(0)
  const apiStateRef = useRef(apiState)
  apiStateRef.current = apiState

  // Poll /api/timer-state every 2 seconds
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/timer-state')
        if (res.ok) setApiState(await res.json())
      } catch {}
    }
    poll()
    const id = setInterval(poll, 300)
    return () => clearInterval(id)
  }, [])

  // Also listen via BroadcastChannel for instant updates in browser popup
  useEffect(() => {
    try {
      const ch = new BroadcastChannel('dayflow-timer')
      ch.onmessage = (e) => {
        if (e.data?.type !== 'TIMER_STATE') return
        // Convert broadcast format to API format
        setApiState(prev => ({
          ...prev,
          active: e.data.active,
          paused: e.data.paused,
          title: e.data.title,
          plannedMins: e.data.plannedMins,
        }))
      }
      return () => ch.close()
    } catch {}
  }, [])

  // Local tick for smooth elapsed time display
  useEffect(() => {
    const tick = () => {
      const s = apiStateRef.current
      if (!s.active || s.paused) { setElapsed(0); return }
      const live = s.timerStartedAt ? Date.now() - s.timerStartedAt : 0
      setElapsed(Math.floor((s.timerAccumulatedMs + live) / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [apiState.active, apiState.paused, apiState.timerStartedAt, apiState.timerAccumulatedMs])

  // Reset window to correct size on mount (clears any leftover size from previous sessions)
  useEffect(() => {
    const webkit = (window as any).webkit
    if (webkit?.messageHandlers?.floatie) {
      webkit.messageHandlers.floatie.postMessage({ action: 'resize', height: '55' })
    }
  }, [])

  // Update window title
  useEffect(() => {
    if (!apiState.active || apiState.paused) { document.title = 'Dayflow Timer'; return }
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60
    document.title = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} ⏱`
  }, [elapsed, apiState.active, apiState.paused])

  if (!apiState.active) {
    return (
      <InactiveState />
    )
  }

  const { title, plannedMins, paused } = apiState
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
        width: '100vw', height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#3a3a3c',
        fontFamily: 'system-ui, sans-serif', gap: 8,
      }}>
        <button onClick={() => sendAction('resume')} title="Resume"
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#4ade80', flexShrink: 0 }}>
          <Play size={11} fill="currentColor" />
        </button>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Paused</span>
        <span style={{ color: 'white', fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <button onClick={() => sendAction('stop')} title="Stop"
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', flexShrink: 0 }}>
          <Square size={11} fill="currentColor" />
        </button>
        <button onClick={minimize} title="Minimize"
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', flexShrink: 0 }}>
          <Minus size={11} />
        </button>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
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
        <button onClick={() => sendAction('pause')} title="Pause"
          style={{ flexShrink: 0, background: colors.btn, border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: colors.timer }}>
          <Pause size={11} fill="currentColor" />
        </button>
        <button onClick={() => sendAction('stop')} title="Stop and save time"
          style={{ flexShrink: 0, background: colors.btn, border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: colors.timer }}>
          <Square size={12} fill="currentColor" />
        </button>
        <button onClick={minimize} title="Minimize"
          style={{ flexShrink: 0, background: colors.btn, border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: colors.timer }}>
          <Minus size={12} />
        </button>
      </div>
      {plannedStr && (
        <div style={{ height: 3, background: colors.barBg }}>
          <div style={{ height: '100%', background: colors.bar, width: `${Math.min(100, progress * 100)}%`, transition: 'width 1s linear' }} />
        </div>
      )}
    </div>
  )
}
