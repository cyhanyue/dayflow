import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const SINGLETON_ID = 'singleton'

export async function GET() {
  const row = await prisma.timerState.findUnique({ where: { id: SINGLETON_ID } })
  if (!row) {
    return NextResponse.json({
      active: false, paused: false, timerStartedAt: null,
      timerAccumulatedMs: 0, title: '', plannedMins: null,
    })
  }
  return NextResponse.json({
    active: row.active,
    paused: row.paused,
    timerStartedAt: row.timerStartedAt ?? null,
    timerAccumulatedMs: row.timerAccumulatedMs,
    title: row.title,
    plannedMins: row.plannedMins ?? null,
  })
}

export async function POST(request: Request) {
  const body = await request.json()
  await prisma.timerState.upsert({
    where: { id: SINGLETON_ID },
    update: {
      active: body.active,
      paused: body.paused,
      timerStartedAt: body.timerStartedAt ?? null,
      timerAccumulatedMs: body.timerAccumulatedMs ?? 0,
      title: body.title ?? '',
      plannedMins: body.plannedMins ?? null,
    },
    create: {
      id: SINGLETON_ID,
      active: body.active,
      paused: body.paused,
      timerStartedAt: body.timerStartedAt ?? null,
      timerAccumulatedMs: body.timerAccumulatedMs ?? 0,
      title: body.title ?? '',
      plannedMins: body.plannedMins ?? null,
    },
  })
  return NextResponse.json({ ok: true })
}
