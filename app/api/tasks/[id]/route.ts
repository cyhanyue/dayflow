import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getNextOccurrence } from '@/lib/utils'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const task = await prisma.task.findFirst({
      where: { id, userId: auth.userId },
      include: { channel: true, subtasks: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(task)
  } catch (err) {
    console.error('GET /api/tasks/[id] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params

    const existing = await prisma.task.findFirst({ where: { id, userId: auth.userId } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { title, channelId, scheduledDate, startDate, dueDate, plannedTimeMinutes,
      actualTimeMinutes, status, sortOrder, isBacklog, isArchived, notes,
      timeboxStart, timeboxEnd, isRecurring, recurrenceRule, consecutiveRolloverCount, completedAt } = await req.json()

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(channelId !== undefined && { channelId }),
        ...(scheduledDate !== undefined && { scheduledDate }),
        ...(startDate !== undefined && { startDate }),
        ...(dueDate !== undefined && { dueDate }),
        ...(plannedTimeMinutes !== undefined && { plannedTimeMinutes }),
        ...(actualTimeMinutes !== undefined && { actualTimeMinutes }),
        ...(status !== undefined && { status }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isBacklog !== undefined && { isBacklog }),
        ...(isArchived !== undefined && { isArchived }),
        ...(notes !== undefined && { notes }),
        ...(timeboxStart !== undefined && { timeboxStart: timeboxStart ? new Date(timeboxStart) : null }),
        ...(timeboxEnd !== undefined && { timeboxEnd: timeboxEnd ? new Date(timeboxEnd) : null }),
        ...(isRecurring !== undefined && { isRecurring }),
        ...(recurrenceRule !== undefined && { recurrenceRule }),
        ...(consecutiveRolloverCount !== undefined && { consecutiveRolloverCount }),
        ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null }),
      },
      include: { channel: true, subtasks: { orderBy: { sortOrder: 'asc' } } },
    })
    // When a recurring task is completed, spawn the next occurrence
    if (status === 'complete' && task.isRecurring && task.recurrenceRule) {
      const fromDate = task.scheduledDate || new Date().toISOString().slice(0, 10)
      const nextDate = getNextOccurrence(task.recurrenceRule, fromDate)
      const agg = await prisma.task.aggregate({
        _max: { sortOrder: true },
        where: { userId: auth.userId, scheduledDate: nextDate },
      })
      await prisma.task.create({
        data: {
          userId: auth.userId,
          title: task.title,
          channelId: task.channelId,
          plannedTimeMinutes: task.plannedTimeMinutes,
          isRecurring: task.isRecurring,
          recurrenceRule: task.recurrenceRule,
          notes: task.notes,
          scheduledDate: nextDate,
          status: 'incomplete',
          sortOrder: (agg._max.sortOrder ?? 0) + 1,
        },
      })
    }

    return NextResponse.json(task)
  } catch (err) {
    console.error('PATCH /api/tasks/[id] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const existing = await prisma.task.findFirst({ where: { id, userId: auth.userId } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await prisma.task.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/tasks/[id] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
