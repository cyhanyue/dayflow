import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  const where: Record<string, unknown> = { userId: auth.userId }
  if (start && end) {
    where.startDatetime = { gte: new Date(start) }
    where.endDatetime = { lte: new Date(end) }
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    include: { calendar: true, channel: true },
    orderBy: { startDatetime: 'asc' },
  })
  return NextResponse.json(events)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await req.json()

  // Find default calendar if not specified
  let calendarId = data.calendarId
  if (!calendarId) {
    const defaultCal = await prisma.calendar.findFirst({
      where: { userId: auth.userId, isDefault: true },
    })
    if (!defaultCal) {
      const firstCal = await prisma.calendar.findFirst({ where: { userId: auth.userId } })
      calendarId = firstCal?.id
    } else {
      calendarId = defaultCal.id
    }
  }

  const event = await prisma.calendarEvent.create({
    data: { ...data, calendarId, userId: auth.userId },
    include: { calendar: true, channel: true },
  })
  return NextResponse.json(event)
}
