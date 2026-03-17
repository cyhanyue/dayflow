import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const existing = await prisma.calendarEvent.findFirst({ where: { id, userId: auth.userId } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { title, description, location, startDatetime, endDatetime, isAllDay, color, calendarId, channelId, status, isCompleted, completedAt } = await req.json()
    const event = await prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(location !== undefined && { location }),
        ...(startDatetime !== undefined && { startDatetime: new Date(startDatetime) }),
        ...(endDatetime !== undefined && { endDatetime: new Date(endDatetime) }),
        ...(isAllDay !== undefined && { isAllDay }),
        ...(color !== undefined && { color }),
        ...(calendarId !== undefined && { calendarId }),
        ...(channelId !== undefined && { channelId }),
        ...(status !== undefined && { status }),
        ...(isCompleted !== undefined && { isCompleted }),
        ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null }),
      },
      include: { calendar: true, channel: true },
    })
    return NextResponse.json(event)
  } catch (err) {
    console.error('PATCH /api/events/[id] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const existing = await prisma.calendarEvent.findFirst({ where: { id, userId: auth.userId } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await prisma.calendarEvent.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/events/[id] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
