import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')

    const where: Record<string, unknown> = { userId: auth.userId }
    if (start && end) {
      const startDate = new Date(start)
      const endDate = new Date(end)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({ error: 'Invalid date parameters' }, { status: 400 })
      }
      where.startDatetime = { gte: startDate }
      where.endDatetime = { lte: endDate }
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      include: { calendar: true, channel: true },
      orderBy: { startDatetime: 'asc' },
    })
    return NextResponse.json(events)
  } catch (err) {
    console.error('GET /api/events error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { title, description, location, startDatetime, endDatetime, isAllDay, color, calendarId: bodyCalendarId, channelId, status, recurrenceRule } = await req.json()
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    if (!startDatetime || !endDatetime) return NextResponse.json({ error: 'Start and end datetime are required' }, { status: 400 })

    const startDate = new Date(startDatetime)
    const endDate = new Date(endDatetime)
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid datetime values' }, { status: 400 })
    }

    let calendarId = bodyCalendarId
    if (!calendarId) {
      const defaultCal = await prisma.calendar.findFirst({ where: { userId: auth.userId, isDefault: true } })
      calendarId = defaultCal?.id
      if (!calendarId) {
        const firstCal = await prisma.calendar.findFirst({ where: { userId: auth.userId } })
        calendarId = firstCal?.id
      }
    }
    if (!calendarId) return NextResponse.json({ error: 'No calendar found' }, { status: 400 })

    const event = await prisma.calendarEvent.create({
      data: {
        userId: auth.userId,
        calendarId,
        title: title.trim(),
        description: description ?? null,
        location: location ?? null,
        startDatetime: startDate,
        endDatetime: endDate,
        isAllDay: isAllDay ?? false,
        color: color ?? null,
        channelId: channelId ?? null,
        status: status ?? 'confirmed',
        recurrenceRule: recurrenceRule ?? null,
      },
      include: { calendar: true, channel: true },
    })
    return NextResponse.json(event)
  } catch (err) {
    console.error('POST /api/events error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
