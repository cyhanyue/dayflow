import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parseIcal } from '@/lib/ical'

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // If a URL is provided in the body, save it first
    let icalUrl: string | null = null
    try {
      const body = await req.json()
      if (body?.url) {
        // Normalize webcal:// → https://
        const normalized = (body.url as string).replace(/^webcal:\/\//i, 'https://')
        await prisma.user.update({ where: { id: auth.userId }, data: { icalUrl: normalized } })
        icalUrl = normalized
      }
    } catch {
      // No body — use stored URL
    }

    if (!icalUrl) {
      const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { icalUrl: true } })
      icalUrl = user?.icalUrl ?? null
    }

    if (!icalUrl) return NextResponse.json({ error: 'No iCal URL configured' }, { status: 400 })

    // Fetch the iCal feed
    let rawIcal: string
    try {
      const res = await fetch(icalUrl, { headers: { 'User-Agent': 'Dayflow/1.0' } })
      if (!res.ok) return NextResponse.json({ error: `Failed to fetch iCal URL (HTTP ${res.status})` }, { status: 502 })
      rawIcal = await res.text()
    } catch (e) {
      return NextResponse.json({ error: `Could not reach the iCal URL: ${(e as Error).message}` }, { status: 502 })
    }

    const parsed = parseIcal(rawIcal)

    const now = new Date()
    const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    const upcoming = parsed.filter(e => e.endDatetime >= now && e.startDatetime <= future)

    let calendar = await prisma.calendar.findFirst({
      where: { userId: auth.userId, name: 'iCal Import' },
    })
    if (!calendar) {
      calendar = await prisma.calendar.create({
        data: { userId: auth.userId, name: 'iCal Import', color: '#0f9d58', isVisible: true, isDefault: false },
      })
    }

    await prisma.calendarEvent.deleteMany({ where: { userId: auth.userId, calendarId: calendar.id } })

    if (upcoming.length > 0) {
      await prisma.calendarEvent.createMany({
        data: upcoming.map(e => ({
          userId: auth.userId,
          calendarId: calendar!.id,
          title: e.title,
          description: e.description,
          location: e.location,
          startDatetime: e.startDatetime,
          endDatetime: e.endDatetime,
          isAllDay: e.isAllDay,
          color: null,
        })),
      })
    }

    return NextResponse.json({ synced: upcoming.length })
  } catch (e) {
    console.error('iCal sync error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
