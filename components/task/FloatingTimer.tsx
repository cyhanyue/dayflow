'use client'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Square, Pause, Play, PictureInPicture2, ExternalLink } from 'lucide-react'

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
      bg: `linear-gradient(135deg, rgb(${r},${Math.max(0,g)},${Math.max(0,b)}), rgb(${Math.max(180,r-20)},20,20))`,
      bgSolid: `rgb(${r},${Math.max(0,g)},${Math.max(0,b)})`,
      text: 'text-white', sub: 'rgba(255,255,255,0.75)', divider: 'rgba(255,255,255,0.3)',
      timer: '#fff', btn: 'rgba(255,255,255,0.2)', bar: 'rgba(255,255,255,0.4)', barBg: 'rgba(255,255,255,0.15)',
    }
  }
  const t = Math.min(1, progress)
  const r = Math.round(186 - t * 156)
  const g = Math.round(230 - t * 150)
  const b = Math.round(253 - t * 60)
  return {
    bg: `linear-gradient(135deg, rgb(${r},${g},${b}), rgb(${Math.max(0,r-30)},${Math.max(0,g-40)},${Math.min(255,b+10)}))`,
    bgSolid: `rgb(${r},${g},${b})`,
    text: t > 0.5 ? 'text-white' : 'text-blue-900',
    sub: t > 0.5 ? 'rgba(255,255,255,0.75)' : 'rgba(30,58,138,0.65)',
    divider: t > 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(30,58,138,0.2)',
    timer: t > 0.5 ? '#fff' : '#1e3a8a',
    btn: t > 0.5 ? 'rgba(255,255,255,0.2)' : 'rgba(30,58,138,0.12)',
    bar: t > 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(30,58,138,0.4)',
    barBg: t > 0.5 ? 'rgba(255,255,255,0.15)' : 'rgba(30,58,138,0.1)',
  }
}

const PIP_W = 260  // logical px
const PIP_H = 52   // logical px (+ 3px progress bar if planned)

// Draw the current timer state onto a canvas for the Video PiP stream.
// ctx is already scaled by DPR — draw at logical coordinates.
function drawTimerCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  emoji: string, title: string, elapsedStr: string,
  bgSolid: string, timerColor: string, subColor: string,
  plannedStr: string | null, progress: number, barColor: string, barBgColor: string,
) {
  ctx.clearRect(0, 0, w, h)

  // Rounded background
  const r = 12
  ctx.fillStyle = bgSolid
  ctx.beginPath()
  ctx.moveTo(r, 0); ctx.lineTo(w - r, 0)
  ctx.arcTo(w, 0, w, r, r); ctx.lineTo(w, h - r)
  ctx.arcTo(w, h, w - r, h, r); ctx.lineTo(r, h)
  ctx.arcTo(0, h, 0, h - r, r); ctx.lineTo(0, r)
  ctx.arcTo(0, 0, r, 0, r)
  ctx.closePath()
  ctx.fill()

  // Emoji
  ctx.font = '20px serif'
  ctx.fillText(emoji, 12, 32)

  // Task title (truncated)
  ctx.fillStyle = timerColor
  ctx.font = 'bold 13px -apple-system, system-ui, sans-serif'
  const maxTitleWidth = w - 104
  let displayTitle = title
  if (ctx.measureText(displayTitle).width > maxTitleWidth) {
    while (ctx.measureText(displayTitle + '…').width > maxTitleWidth && displayTitle.length > 0) {
      displayTitle = displayTitle.slice(0, -1)
    }
    displayTitle += '…'
  }
  ctx.fillText(displayTitle, 38, 24)

  // Planned label below title
  if (plannedStr) {
    ctx.fillStyle = subColor
    ctx.font = '10px -apple-system, system-ui, sans-serif'
    ctx.fillText(`/ ${plannedStr}`, 38, 38)
  }

  // Elapsed time (right-aligned, large monospace)
  ctx.fillStyle = timerColor
  ctx.font = 'bold 22px ui-monospace, monospace'
  ctx.textAlign = 'right'
  ctx.fillText(elapsedStr, w - 12, 32)

  ctx.textAlign = 'left'

  // Progress bar
  if (plannedStr) {
    ctx.fillStyle = barBgColor
    ctx.fillRect(0, h - 3, w, 3)
    ctx.fillStyle = barColor
    ctx.fillRect(0, h - 3, w * Math.min(1, progress), 3)
  }
}

export default function FloatingTimer() {
  const {
    activeTimerTaskId, timerTaskTitle, timerStartedAt,
    timerAccumulatedMs, isTimerPaused,
    pauseTimer, resumeTimer, stopTimer,
    tasks, updateTask,
  } = useAppStore()
  const [elapsed, setElapsed] = useState(0)
  const [isPipActive, setIsPipActive] = useState(false)

  // Drag state (for in-page mode)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const timerRef = useRef<HTMLDivElement>(null)

  // Canvas + video refs for native Video PiP
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Popout window ref + broadcast channel
  const popoutRef = useRef<Window | null>(null)
  const broadcastRef = useRef<BroadcastChannel | null>(null)
  const actionHandlerRef = useRef<(action: string) => void>(() => {})

  // Tick elapsed time
  useEffect(() => {
    if (!activeTimerTaskId || isTimerPaused) { setElapsed(0); return }
    const tick = () => {
      const live = timerStartedAt ? Date.now() - timerStartedAt : 0
      setElapsed(Math.floor((timerAccumulatedMs + live) / 1000))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [activeTimerTaskId, isTimerPaused, timerStartedAt, timerAccumulatedMs])

  // Open / maintain BroadcastChannel and listen for actions from the popup
  useEffect(() => {
    broadcastRef.current = new BroadcastChannel('dayflow-timer')
    broadcastRef.current.onmessage = (e) => {
      if (e.data?.type === 'TIMER_ACTION') actionHandlerRef.current(e.data.action)
    }
    return () => { broadcastRef.current?.close(); broadcastRef.current = null }
  }, [])

  // Broadcast timer state to browser popup every tick (BroadcastChannel)
  useEffect(() => {
    if (!broadcastRef.current) return
    const task = tasks.find(t => t.id === activeTimerTaskId)
    broadcastRef.current.postMessage({
      type: 'TIMER_STATE',
      active: !!activeTimerTaskId,
      paused: isTimerPaused,
      elapsed,
      title: timerTaskTitle || task?.title || 'Task',
      plannedMins: task?.plannedTimeMinutes ?? null,
    })
  }, [elapsed, activeTimerTaskId, isTimerPaused, timerTaskTitle, tasks])

  // Sync timer state to API for native floatie (WKWebView can't use BroadcastChannel)
  useEffect(() => {
    const task = tasks.find(t => t.id === activeTimerTaskId)
    fetch('/api/timer-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        active: !!activeTimerTaskId,
        paused: isTimerPaused,
        timerStartedAt,
        timerAccumulatedMs,
        title: timerTaskTitle || task?.title || 'Task',
        plannedMins: task?.plannedTimeMinutes ?? null,
      }),
    }).catch(() => {})
  }, [activeTimerTaskId, isTimerPaused, timerStartedAt, timerAccumulatedMs, timerTaskTitle, tasks])

  // Update browser tab title with elapsed time
  useEffect(() => {
    const originalTitle = document.title
    if (!activeTimerTaskId || isTimerPaused) {
      document.title = originalTitle.replace(/^\d{2}:\d{2} ⏱ /, '')
      return
    }
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    document.title = `${timeStr} ⏱ Dayflow`
    return () => { document.title = 'Dayflow' }
  }, [elapsed, activeTimerTaskId, isTimerPaused])

  // Default position
  useEffect(() => {
    if (!pos && typeof window !== 'undefined') {
      setPos({ x: window.innerWidth / 2 - 180, y: window.innerHeight - 80 })
    }
  }, [pos])

  // Exit PiP when timer is paused or stopped
  useEffect(() => {
    if ((!activeTimerTaskId || isTimerPaused) && isPipActive && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {})
    }
  }, [activeTimerTaskId, isTimerPaused, isPipActive])

  // Detect when the user closes the native PiP window
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onLeave = () => setIsPipActive(false)
    video.addEventListener('leavepictureinpicture', onLeave)
    return () => video.removeEventListener('leavepictureinpicture', onLeave)
  }, [])

  // Mouse drag handlers
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

  const task = tasks.find(t => t.id === activeTimerTaskId)

  // Keep action handler ref current so both BroadcastChannel and API polling call the latest version
  async function handleStop() {
    if (!activeTimerTaskId) return
    const live = timerStartedAt ? Date.now() - timerStartedAt : 0
    const durationMinutes = Math.round((timerAccumulatedMs + live) / 60000)
    const newActual = (task?.actualTimeMinutes || 0) + durationMinutes
    updateTask(activeTimerTaskId, { actualTimeMinutes: newActual })
    await fetch(`/api/tasks/${activeTimerTaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actualTimeMinutes: newActual }),
    })
    stopTimer()
  }

  actionHandlerRef.current = (action: string) => {
    if (action === 'pause') pauseTimer()
    else if (action === 'resume') resumeTimer()
    else if (action === 'stop') handleStop()
  }

  // Poll for actions posted by the native floatie (WKWebView can't use BroadcastChannel)
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/timer-action')
        const { action } = await res.json()
        if (action) actionHandlerRef.current(action)
      } catch {}
    }, 200)
    return () => clearInterval(id)
  }, [])

  // Timer inactive — render nothing (but keep hidden canvas/video in DOM for PiP setup)
  if (!activeTimerTaskId) return (
    <>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />
    </>
  )

  const title = timerTaskTitle || task?.title || 'Task'
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const planned = task?.plannedTimeMinutes ?? null
  const progress = planned ? elapsed / (planned * 60) : mins / 45
  const colors = getColors(mins, progress)
  const emoji = getEmoji(mins, planned)
  const message = getMessage(mins, planned)
  const elapsedStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  const plannedStr = planned
    ? planned >= 60 ? `${Math.floor(planned / 60)}h${planned % 60 > 0 ? `${planned % 60}m` : ''}` : `${planned}m`
    : null

  // Keep canvas in sync with timer state (drives the Video PiP display)
  if (canvasRef.current && isPipActive) {
    const pipH = PIP_H + (plannedStr ? 3 : 0)
    const ctx = canvasRef.current.getContext('2d')
    if (ctx) drawTimerCanvas(ctx, PIP_W, pipH, emoji, title, elapsedStr,
      colors.bgSolid, colors.timer, colors.sub,
      plannedStr, progress, colors.bar, colors.barBg)
  }

  function openPopout() {
    if (popoutRef.current && !popoutRef.current.closed) {
      popoutRef.current.focus()
      return
    }
    popoutRef.current = window.open(
      '/timer',
      'dayflow-timer',
      'popup,width=380,height=72',
    )
  }

  async function openPiP() {
    if (!canvasRef.current || !videoRef.current) return
    if (!document.pictureInPictureEnabled) {
      alert('Picture-in-Picture is not supported in this browser.')
      return
    }
    try {
      const pipH = PIP_H + (plannedStr ? 3 : 0)
      canvasRef.current.width = PIP_W
      canvasRef.current.height = pipH
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        drawTimerCanvas(ctx, PIP_W, pipH, emoji, title, elapsedStr,
          colors.bgSolid, colors.timer, colors.sub,
          plannedStr, progress, colors.bar, colors.barBg)
      }
      // Stream canvas → video → native PiP (OS-level always-on-top)
      const stream = canvasRef.current.captureStream(10)
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      await videoRef.current.requestPictureInPicture()
      setIsPipActive(true)
    } catch (err) {
      console.warn('PiP failed:', err)
    }
  }

  // Timer paused — show a minimal resume pill
  if (isTimerPaused) {
    return (
      <>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <video ref={videoRef} style={{ display: 'none' }} muted playsInline />
        <div
          style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 99999, userSelect: 'none' }}
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-stone-700 text-white text-xs shadow-lg cursor-pointer"
          onClick={resumeTimer}
          title="Resume timer"
        >
          <Play size={11} fill="currentColor" className="text-green-400" />
          <span className="opacity-70">Paused</span>
          <span className="font-medium truncate max-w-[160px]">{timerTaskTitle || task?.title || 'Timer'}</span>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Hidden canvas + video — power the native Video PiP stream */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />

      {/* In-page floating timer */}
      <div
        ref={timerRef}
        style={{
          position: 'fixed',
          left: pos?.x ?? '50%',
          top: pos?.y ?? undefined,
          bottom: pos ? undefined : 20,
          transform: pos ? undefined : 'translateX(-50%)',
          zIndex: 99999,
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
          style={{ background: colors.bg, transition: 'background 2s ease', cursor: 'grab', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={`text-sm font-semibold truncate ${colors.text}`}>{title}</div>
            <div style={{ fontSize: 11, color: colors.sub }}>{message}</div>
          </div>

          <div style={{ width: 1, height: 32, background: colors.divider, flexShrink: 0 }} />

          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 18, color: colors.timer, lineHeight: 1.1 } as React.CSSProperties}>
              {elapsedStr}
            </div>
            {plannedStr && (
              <div style={{ fontSize: 11, color: colors.sub, textAlign: 'center' }}>/ {plannedStr}</div>
            )}
          </div>

          {/* Pop-out button */}
          <button
            onClick={openPopout}
            onMouseDown={e => e.stopPropagation()}
            title="Open in separate window"
            style={{ flexShrink: 0, background: colors.btn, border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: colors.timer, transition: 'background 0.2s' }}
          >
            <ExternalLink size={12} />
          </button>

          {/* PiP button */}
          <button
            onClick={openPiP}
            onMouseDown={e => e.stopPropagation()}
            title="Float above all windows (Picture-in-Picture)"
            style={{ flexShrink: 0, background: isPipActive ? 'rgba(255,255,255,0.35)' : colors.btn, border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: colors.timer, transition: 'background 0.2s' }}
          >
            <PictureInPicture2 size={12} />
          </button>

          {/* Pause button */}
          <button
            onClick={pauseTimer}
            onMouseDown={e => e.stopPropagation()}
            title="Pause"
            style={{ flexShrink: 0, background: colors.btn, border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: colors.timer, transition: 'background 0.2s' }}
          >
            <Pause size={11} fill="currentColor" />
          </button>

          {/* Stop button */}
          <button
            onClick={handleStop}
            onMouseDown={e => e.stopPropagation()}
            title="Stop and save time"
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
    </>
  )
}
