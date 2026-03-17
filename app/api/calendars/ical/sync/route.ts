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
        const normalized = (body.url as string).replace(/^webcal:\/\//i, 'https://')
        await prisma.user.update({ where: { id: auth.userId }, data: { icalUrl: normalized } })
        icalUrl = normalized
      }
    } catch {
      // No body — use stored URL
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { icalUrl: true, email: true },
    })
    if (!icalUrl) icalUrl = user?.icalUrl ?? null
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

    // Parse, passing user email so declined events are filtered out
    const parsed = parseIcal(rawIcal, user?.email ?? undefined)

    const now = new Date()
    // Sync window: 7 days back to 60 days ahead (same as Google Calendar sync)
    const syncStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const syncEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)

    // Only include events within the sync window
    const upcoming = parsed.filter(e => e.endDatetime >= syncStart && e.startDatetime <= syncEnd)

    let calendar = await prisma.calendar.findFirst({
      where: { userId: auth.userId, name: 'iCal Import' },
    })
    if (!calendar) {
      calendar = await prisma.calendar.create({
        data: { userId: auth.userId, name: 'iCal Import', color: '#0f9d58', isVisible: true, isDefault: false },
      })
    }

    // Preserve completion state: snapshot which UIDs were marked done before deleting
    const existingCompleted = await prisma.calendarEvent.findMany({
      where: { userId: auth.userId, calendarId: calendar.id, isCompleted: true, uid: { not: null } },
      select: { uid: true, completedAt: true },
    })
    const completionByUid = new Map(existingCompleted.map(e => [e.uid!, e.completedAt]))

    // Step 1: Delete events OUTSIDE the sync window whose UID appears in the feed.
    // This handles events that were moved FROM an old date (before syncStart) to a new date —
    // the old entry sits outside the window-based delete below, so we must find it by UID.
    const uidsInFeed = [...new Set(upcoming.map(e => e.uid).filter((u): u is string => !!u))]
    if (uidsInFeed.length > 0) {
      await prisma.calendarEvent.deleteMany({
        where: {
          userId: auth.userId,
          calendarId: calendar.id,
          uid: { in: uidsInFeed },
          startDatetime: { lt: syncStart },
        },
      })
    }

    // Step 2: Unconditionally delete ALL events within the sync window.
    // Using an unconditional delete (no uid filter) correctly handles both old rows with
    // uid=NULL and new rows with uid set — avoids the SQL NULL NOT IN trap.
    await prisma.calendarEvent.deleteMany({
      where: {
        userId: auth.userId,
        calendarId: calendar.id,
        startDatetime: { gte: syncStart },
      },
    })

    if (upcoming.length > 0) {
      await prisma.calendarEvent.createMany({
        data: upcoming.map(e => ({
          userId: auth.userId,
          calendarId: calendar!.id,
          uid: e.uid,
          title: e.title,
          description: e.description,
          location: e.location,
          startDatetime: e.startDatetime,
          endDatetime: e.endDatetime,
          isAllDay: e.isAllDay,
          status: e.status,
          color: null,
        })),
      })

      // Restore completion state for events the user had already marked done
      for (const [uid, completedAt] of completionByUid) {
        if (uidsInFeed.includes(uid)) {
          await prisma.calendarEvent.updateMany({
            where: { userId: auth.userId, calendarId: calendar!.id, uid },
            data: { isCompleted: true, completedAt },
          })
        }
      }
    }

    return NextResponse.json({ synced: upcoming.length })
  } catch (e) {
    console.error('iCal sync error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
