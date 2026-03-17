'use client'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Square, Pause, Play, PictureInPicture2 } from 'lucide-react'

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

// Draw the current timer state onto a canvas for the Video PiP stream
function drawTimerCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  emoji: string, title: string, elapsedStr: string, message: string,
  bgSolid: string, timerColor: string, subColor: string,
  plannedStr: string | null, progress: number, barColor: string, barBgColor: string,
) {
  ctx.clearRect(0, 0, w, h)

  // Background
  ctx.fillStyle = bgSolid
  ctx.fillRect(0, 0, w, h)

  // Emoji
  ctx.font = '28px serif'
  ctx.fillText(emoji, 14, 38)

  // Task title
  ctx.fillStyle = timerColor
  ctx.font = 'bold 15px system-ui, sans-serif'
  const maxTitleWidth = w - 130
  let displayTitle = title
  if (ctx.measureText(displayTitle).width > maxTitleWidth) {
    while (ctx.measureText(displayTitle + '…').width > maxTitleWidth && displayTitle.length > 0) {
      displayTitle = displayTitle.slice(0, -1)
    }
    displayTitle += '…'
  }
  ctx.fillText(displayTitle, 50, 28)

  // Message
  ctx.fillStyle = subColor
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(message, 50, 46)

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(w - 100, 12, 1, 36)

  // Elapsed time
  ctx.fillStyle = timerColor
  ctx.font = 'bold 26px monospace'
  ctx.textAlign = 'right'
  ctx.fillText(elapsedStr, w - 14, 36)

  // Planned time
  if (plannedStr) {
    ctx.fillStyle = subColor
    ctx.font = '12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`/ ${plannedStr}`, w - 57, 52)
  }

  ctx.textAlign = 'left'

  // Progress bar
  if (plannedStr) {
    ctx.fillStyle = barBgColor
    ctx.fillRect(0, h - 4, w, 4)
    ctx.fillStyle = barColor
    ctx.fillRect(0, h - 4, w * Math.min(1, progress), 4)
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

  // Timer inactive — render nothing (but keep hidden canvas/video in DOM for PiP setup)
  if (!activeTimerTaskId) return (
    <>
      <canvas ref={canvasRef} width={380} height={64} style={{ display: 'none' }} />
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />
    </>
  )

  const task = tasks.find(t => t.id === activeTimerTaskId)

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
    const ctx = canvasRef.current.getContext('2d')
    if (ctx) {
      drawTimerCanvas(ctx, 380, 64, emoji, title, elapsedStr, message,
        colors.bgSolid, colors.timer, colors.sub,
        plannedStr, progress, colors.bar, colors.barBg)
    }
  }

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

  async function openPiP() {
    if (!canvasRef.current || !videoRef.current) return
    if (!document.pictureInPictureEnabled) {
      alert('Picture-in-Picture is not supported in this browser.')
      return
    }
    try {
      // Draw initial frame before streaming
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        drawTimerCanvas(ctx, 380, 64, emoji, title, elapsedStr, message,
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
        <canvas ref={canvasRef} width={380} height={64} style={{ display: 'none' }} />
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
      <canvas ref={canvasRef} width={380} height={64} style={{ display: 'none' }} />
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
