import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const isBacklog = searchParams.get('backlog') === 'true'
    const status = searchParams.get('status')

    const where: Record<string, unknown> = { userId: auth.userId, parentTaskId: null }
    if (isBacklog) {
      where.isBacklog = true
      where.isArchived = false
    } else if (date) {
      where.scheduledDate = date
      where.isBacklog = false
      where.isArchived = false
    }
    if (status) where.status = status

    const tasks = await prisma.task.findMany({
      where,
      include: { channel: true, subtasks: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(tasks)
  } catch (err) {
    console.error('GET /api/tasks error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { title, channelId, scheduledDate, plannedTimeMinutes, isBacklog, parentTaskId, notes, isRecurring, recurrenceRule } = await req.json()
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const task = await prisma.task.create({
      data: {
        userId: auth.userId,
        title: title.trim(),
        channelId: channelId ?? null,
        scheduledDate: scheduledDate ?? null,
        plannedTimeMinutes: plannedTimeMinutes ?? null,
        isBacklog: isBacklog ?? false,
        parentTaskId: parentTaskId ?? null,
        notes: notes ?? null,
        isRecurring: isRecurring ?? false,
        recurrenceRule: recurrenceRule ?? null,
      },
      include: { channel: true, subtasks: true },
    })
    return NextResponse.json(task)
  } catch (err) {
    console.error('POST /api/tasks error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
