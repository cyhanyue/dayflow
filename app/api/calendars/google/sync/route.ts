import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

async function getAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleRefreshToken: true, googleAccessToken: true, googleTokenExpiry: true },
  })
  if (!user?.googleRefreshToken) return null

  // Return cached token if still valid (5 min buffer)
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

export async function POST() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessToken = await getAccessToken(auth.userId)
  if (!accessToken) return NextResponse.json({ error: 'Not connected to Google Calendar' }, { status: 400 })

  // Get or create our Google Calendar record
  let calendar = await prisma.calendar.findFirst({
    where: { userId: auth.userId, name: 'Google Calendar' },
  })
  if (!calendar) {
    calendar = await prisma.calendar.create({
      data: { userId: auth.userId, name: 'Google Calendar', color: '#4285f4', isVisible: true, isDefault: false },
    })
  }

  // Fetch events from Google (next 60 days)
  const now = new Date()
  const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)

  const eventsRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!eventsRes.ok) {
    const err = await eventsRes.json()
    return NextResponse.json({ error: 'Failed to fetch from Google', details: err }, { status: 502 })
  }

  const { items } = await eventsRes.json()

  // Replace all existing Google Calendar events with fresh data
  await prisma.calendarEvent.deleteMany({ where: { userId: auth.userId, calendarId: calendar.id } })

  const events = ((items as Record<string, unknown>[]) || [])
    .filter(item => item.status !== 'cancelled' && ((item.start as Record<string, string>)?.dateTime || (item.start as Record<string, string>)?.date))
    .map(item => {
      const start = item.start as Record<string, string>
      const end = item.end as Record<string, string>
      const isAllDay = !!start?.date && !start?.dateTime
      const startDatetime = isAllDay
        ? new Date(start.date + 'T00:00:00')
        : new Date(start.dateTime)
      const endDatetime = isAllDay
        ? new Date((end?.date || start.date) + 'T23:59:59')
        : new Date(end?.dateTime || start.dateTime)
      return {
        userId: auth.userId,
        calendarId: calendar!.id,
        title: (item.summary as string) || '(No title)',
        description: (item.description as string) || null,
        location: (item.location as string) || null,
        startDatetime,
        endDatetime,
        isAllDay,
        color: null,
      }
    })

  if (events.length > 0) {
    await prisma.calendarEvent.createMany({ data: events })
  }

  return NextResponse.json({ synced: events.length })
}
