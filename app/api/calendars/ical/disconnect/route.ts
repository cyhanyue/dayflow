import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.user.update({ where: { id: auth.userId }, data: { icalUrl: null } })

  const calendar = await prisma.calendar.findFirst({
    where: { userId: auth.userId, name: 'iCal Import' },
  })
  if (calendar) {
    await prisma.calendarEvent.deleteMany({ where: { calendarId: calendar.id } })
    await prisma.calendar.delete({ where: { id: calendar.id } })
  }

  return NextResponse.json({ success: true })
}
