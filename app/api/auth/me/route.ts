import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

const SELECT = {
  id: true, name: true, email: true, theme: true,
  timeIncrement: true, autoRolloverIncompleteTasks: true,
  rolloverPosition: true, hideCompletedTasksToday: true,
  autoArchiveAfterDays: true, calendarEventColoring: true,
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: SELECT })
  return NextResponse.json(user)
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await req.json()
  const allowedKeys = Object.keys(SELECT).filter(k => k !== 'id' && k !== 'email')
  const filtered = Object.fromEntries(Object.entries(data).filter(([k]) => allowedKeys.includes(k)))
  const user = await prisma.user.update({ where: { id: auth.userId }, data: filtered, select: SELECT })
  return NextResponse.json(user)
}
