import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { differenceInMinutes, subDays, subMonths, startOfDay, endOfDay, format } from 'date-fns'

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const range = searchParams.get('range') ?? '7d'

    const now = new Date()
    let rangeStart: Date
    if (range === '7d') rangeStart = subDays(now, 6)
    else if (range === '30d') rangeStart = subDays(now, 29)
    else rangeStart = subMonths(now, 3)

    const rangeStartDay = startOfDay(rangeStart)
    const rangeEndDay = endOfDay(now)

    // Completed tasks in range
    const completedTasks = await prisma.task.findMany({
      where: {
        userId: auth.userId,
        status: 'complete',
        completedAt: { gte: rangeStartDay, lte: rangeEndDay },
        parentTaskId: null, // exclude subtasks from daily totals
      },
      include: { channel: true },
    })

    // All events (confirmed) in range for meeting hours
    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: auth.userId,
        status: { not: 'cancelled' },
        isAllDay: false,
        startDatetime: { gte: rangeStartDay, lte: rangeEndDay },
      },
      include: { calendar: true },
    })

    // Build daily breakdown
    const dayMap: Record<string, {
      date: string
      taskMinutes: number
      meetingMinutes: number
      plannedMinutes: number
      completedTaskCount: number
      meetingCount: number
    }> = {}

    // Seed all days in range
    let cur = new Date(rangeStartDay)
    while (cur <= rangeEndDay) {
      const key = format(cur, 'yyyy-MM-dd')
      dayMap[key] = { date: key, taskMinutes: 0, meetingMinutes: 0, plannedMinutes: 0, completedTaskCount: 0, meetingCount: 0 }
      cur = new Date(cur.getTime() + 86400000)
    }

    // Add task data
    for (const task of completedTasks) {
      if (!task.completedAt) continue
      const key = format(task.completedAt, 'yyyy-MM-dd')
      if (!dayMap[key]) continue
      const actual = task.actualTimeMinutes ?? task.plannedTimeMinutes ?? 0
      dayMap[key].taskMinutes += actual
      dayMap[key].plannedMinutes += task.plannedTimeMinutes ?? 0
      dayMap[key].completedTaskCount++
    }

    // Add meeting data
    for (const event of events) {
      const key = format(event.startDatetime, 'yyyy-MM-dd')
      if (!dayMap[key]) continue
      const dur = differenceInMinutes(event.endDatetime, event.startDatetime)
      if (dur > 0) {
        dayMap[key].meetingMinutes += dur
        dayMap[key].meetingCount++
      }
    }

    const daily = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))

    // Recurring task stats
    const recurringTasks = await prisma.task.findMany({
      where: {
        userId: auth.userId,
        isRecurring: true,
        status: 'complete',
        completedAt: { gte: subMonths(now, 3), lte: rangeEndDay },
      },
    })

    // Group by title + recurrenceRule
    const recurringMap: Record<string, {
      title: string
      recurrenceRule: string
      week: { count: number; actualMinutes: number; plannedMinutes: number }
      month: { count: number; actualMinutes: number; plannedMinutes: number }
      quarter: { count: number; actualMinutes: number; plannedMinutes: number }
    }> = {}

    const weekAgo = subDays(now, 6)
    const monthAgo = subDays(now, 29)

    for (const task of recurringTasks) {
      if (!task.completedAt || !task.recurrenceRule) continue
      const key = `${task.title}||${task.recurrenceRule}`
      if (!recurringMap[key]) {
        recurringMap[key] = {
          title: task.title,
          recurrenceRule: task.recurrenceRule,
          week: { count: 0, actualMinutes: 0, plannedMinutes: 0 },
          month: { count: 0, actualMinutes: 0, plannedMinutes: 0 },
          quarter: { count: 0, actualMinutes: 0, plannedMinutes: 0 },
        }
      }
      const actual = task.actualTimeMinutes ?? 0
      const planned = task.plannedTimeMinutes ?? 0
      const completedAt = task.completedAt

      recurringMap[key].quarter.count++
      recurringMap[key].quarter.actualMinutes += actual
      recurringMap[key].quarter.plannedMinutes += planned

      if (completedAt >= startOfDay(monthAgo)) {
        recurringMap[key].month.count++
        recurringMap[key].month.actualMinutes += actual
        recurringMap[key].month.plannedMinutes += planned
      }
      if (completedAt >= startOfDay(weekAgo)) {
        recurringMap[key].week.count++
        recurringMap[key].week.actualMinutes += actual
        recurringMap[key].week.plannedMinutes += planned
      }
    }

    const recurring = Object.values(recurringMap)
      .filter(r => r.quarter.count > 0)
      .sort((a, b) => b.quarter.count - a.quarter.count)

    // Summary totals for the range
    const totalTaskMinutes = daily.reduce((s, d) => s + d.taskMinutes, 0)
    const totalMeetingMinutes = daily.reduce((s, d) => s + d.meetingMinutes, 0)
    const totalPlannedMinutes = daily.reduce((s, d) => s + d.plannedMinutes, 0)
    const totalCompletedTasks = daily.reduce((s, d) => s + d.completedTaskCount, 0)

    return NextResponse.json({
      daily,
      recurring,
      summary: {
        totalTaskMinutes,
        totalMeetingMinutes,
        totalPlannedMinutes,
        totalCompletedTasks,
        range,
      },
    })
  } catch (err) {
    console.error('GET /api/analytics error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
