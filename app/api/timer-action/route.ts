import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const SINGLETON_ID = 'singleton'

export async function GET() {
  const row = await prisma.timerState.findUnique({
    where: { id: SINGLETON_ID },
    select: { pendingAction: true },
  })
  const action = row?.pendingAction ?? null
  if (action) {
    // Consume the action
    await prisma.timerState.update({
      where: { id: SINGLETON_ID },
      data: { pendingAction: null },
    })
  }
  return NextResponse.json({ action })
}

export async function POST(request: Request) {
  const { action } = await request.json()
  await prisma.timerState.upsert({
    where: { id: SINGLETON_ID },
    update: { pendingAction: action },
    create: { id: SINGLETON_ID, pendingAction: action },
  })
  return NextResponse.json({ ok: true })
}
