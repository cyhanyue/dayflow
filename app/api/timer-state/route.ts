import { NextResponse } from 'next/server'

interface TimerState {
  active: boolean
  paused: boolean
  timerStartedAt: number | null
  timerAccumulatedMs: number
  title: string
  plannedMins: number | null
}

// In-memory store — lives as long as the dev server is running
let state: TimerState = {
  active: false,
  paused: false,
  timerStartedAt: null,
  timerAccumulatedMs: 0,
  title: '',
  plannedMins: null,
}

export async function GET() {
  return NextResponse.json(state)
}

export async function POST(request: Request) {
  state = await request.json()
  return NextResponse.json({ ok: true })
}
