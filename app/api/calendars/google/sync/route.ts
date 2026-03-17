import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface GoogleAttendee {
  email?: string
  self?: boolean
  responseStatus?: string // 'accepted' | 'declined' | 'tentative' | 'needsAction'
}

interface GoogleCalendarItem {
  summary?: string
  description?: string
  location?: string
  status?: string // 'confirmed' | 'tentative' | 'cancelled'
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: GoogleAttendee[]
  organizer?: { email?: string; self?: boolean }
}

async function getAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleRefreshToken: true, googleAccessToken: true, googleTokenExpiry: true },
  })
  if (!user?.googleRefreshToken) return null

  if (user.googleAccessToken && user.googleTokenExpiry && user.googleTokenExpiry > new Date(Date.now() + 5 * 60 * 1000)) {
    return user.googleAccessToken
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: user.googleRefreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const tokens = await res.json()
  if (!tokens.access_token) return null

  await prisma.user.update({
    where: { id: userId },
    data: {
      googleAccessToken: tokens.access_token,
      googleTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
    },
  })
  return tokens.access_token
}

/**
 * Strict attendance filter — mirrors the user's visibility rules:
 *
 *  INCLUDE when:
 *    1. I'm listed as an attendee (self=true) with responseStatus "accepted" or "tentative"
 *    2. There are NO attendees at all (solo personal event) AND not cancelled
 *
 *  EXCLUDE:
 *    - status === "cancelled"
 *    - myResponseStatus === "declined" or "needsAction"
 *    - events where organizer.self but attendees exist and I've declined/not responded
 *
 * Note: we intentionally do NOT include events just because organizer.self is true when
 * attendees are present — the user's explicit response is the source of truth.
 */
function shouldInclude(item: GoogleCalendarItem): boolean {
  // Always skip cancelled events
  if (item.status === 'cancelled') return false
  if (!item.start?.dateTime && !item.start?.date) return false

  const attendees = item.attendees ?? []

  // No attendees → solo / personal event created by the user
  if (attendees.length === 0) return true

  // Has attendees — find the current user's entry
  const myEntry = attendees.find(a => a.self === true)

  if (!myEntry) {
    // Not listed as attendee at all (unusual). Fall back to organizer check.
    return item.organizer?.self === true
  }

  return myEntry.responseStatus === 'accepted' || myEntry.responseStatus === 'tentative'
}

function deriveStatus(item: GoogleCalendarItem): string {
  const myEntry = item.attendees?.find(a => a.self === true)
  if (myEntry?.responseStatus === 'tentative' || item.status === 'tentative') return 'tentative'
  return 'confirmed'
}

export async function POST() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessToken = await getAccessToken(auth.userId)
  if (!accessToken) return NextResponse.json({ error: 'Not connected to Google Calendar' }, { status: 400 })

  let calendar = await prisma.calendar.findFirst({
    where: { userId: auth.userId, name: 'Google Calendar' },
  })
  if (!calendar) {
    calendar = await prisma.calendar.create({
      data: { userId: auth.userId, name: 'Google Calendar', color: '#4285f4', isVisible: true, isDefault: false },
    })
  }

  const now = new Date()
  // Fetch events from 7 days ago through 60 days ahead so recently-passed events stay visible
  const syncStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const syncEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)

  const eventsRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    new URLSearchParams({
      timeMin: syncStart.toISOString(),
      timeMax: syncEnd.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '500',
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!eventsRes.ok) {
    const err = await eventsRes.json()
    return NextResponse.json({ error: 'Failed to fetch from Google', details: err }, { status: 502 })
  }

  const { items } = await eventsRes.json()
  const allItems: GoogleCalendarItem[] = items || []
  const filtered = allItems.filter(shouldInclude)

  // Only delete+recreate events within our sync window — preserving older history
  await prisma.calendarEvent.deleteMany({
    where: {
      userId: auth.userId,
      calendarId: calendar.id,
      startDatetime: { gte: syncStart },
    },
  })

  const events = filtered.map(item => {
    const start = item.start!
    const end = item.end!
    const isAllDay = !!start.date && !start.dateTime
    const startDatetime = isAllDay
      ? new Date(start.date! + 'T00:00:00')
      : new Date(start.dateTime!)
    const endDatetime = isAllDay
      ? new Date((end.date || start.date) + 'T23:59:59')
      : new Date(end.dateTime || start.dateTime!)

    return {
      userId: auth.userId,
      calendarId: calendar!.id,
      title: item.summary || '(No title)',
      description: item.description || null,
      location: item.location || null,
      startDatetime,
      endDatetime,
      isAllDay,
      color: null,
      status: deriveStatus(item),
    }
  })

  if (events.length > 0) {
    await prisma.calendarEvent.createMany({ data: events })
  }

  return NextResponse.json({ synced: events.length })
}
