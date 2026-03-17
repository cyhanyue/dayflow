import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

const SELECT = {
  id: true, name: true, email: true, theme: true,
  timeIncrement: true, autoRolloverIncompleteTasks: true,
  rolloverPosition: true, hideCompletedTasksToday: true,
  autoArchiveAfterDays: true, calendarEventColoring: true,
  googleRefreshToken: true, icalUrl: true,
}

export async function GET() {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: SELECT })
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { googleRefreshToken, icalUrl, ...rest } = user
    return NextResponse.json({ ...rest, googleConnected: !!googleRefreshToken, icalConnected: !!icalUrl })
  } catch (err) {
    console.error('GET /api/auth/me error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const data = await req.json()
    const allowedKeys = ['name', 'theme', 'timeIncrement', 'autoRolloverIncompleteTasks',
      'rolloverPosition', 'hideCompletedTasksToday', 'autoArchiveAfterDays', 'calendarEventColoring']
    const filtered = Object.fromEntries(Object.entries(data).filter(([k]) => allowedKeys.includes(k)))
    const user = await prisma.user.update({
      where: { id: auth.userId },
      data: filtered,
      select: SELECT,
    })
    const { googleRefreshToken, icalUrl, ...rest } = user
    return NextResponse.json({ ...rest, googleConnected: !!googleRefreshToken, icalConnected: !!icalUrl })
  } catch (err) {
    console.error('PATCH /api/auth/me error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
