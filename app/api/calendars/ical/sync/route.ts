import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface ParsedEvent {
  uid: string | null
  title: string
  description: string | null
  location: string | null
  organizer: string | null
  attendees: string[]
  startDatetime: Date
  endDatetime: Date
  isAllDay: boolean
  status: 'confirmed' | 'tentative'
}

/**
 * Run lib/parse_ical.py as a subprocess, pipe rawIcal to stdin, return parsed events.
 * The Python script uses the `icalendar` + `recurring-ical-events` libraries for
 * RFC-5545-compliant RRULE expansion and ACCEPTED-attendee filtering.
 */
function parseIcalPython(
  rawIcal: string,
  userEmail: string | undefined,
  syncStart: Date,
  syncEnd: Date,
): Promise<ParsedEvent[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'lib', 'parse_ical.py')
    // Resolve python3: prefer the PATH python3, fall back to common Anaconda location
    const python = process.env.PYTHON_BIN ?? '/opt/anaconda3/bin/python3'
    const py = spawn(python, [
      scriptPath,
      userEmail ?? 'null',
      syncStart.toISOString(),
      syncEnd.toISOString(),
    ])

    py.stdin.write(rawIcal, 'utf8')
    py.stdin.end()

    let stdout = ''
    let stderr = ''
    py.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    py.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    py.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`parse_ical.py exited ${code}: ${stderr.trim() || stdout.trim()}`))
      }
      try {
        const raw = JSON.parse(stdout)
        if (raw && typeof raw === 'object' && 'error' in raw) {
          return reject(new Error(String(raw.error)))
        }
        if (stderr.trim()) console.log('[iCal parse]\n' + stderr.trim())
        const events: ParsedEvent[] = (raw as Array<Record<string, unknown>>).map(e => ({
          uid: (e.uid as string | null) ?? null,
          title: (e.title as string) || '(No title)',
          description: (e.description as string | null) ?? null,
          location: (e.location as string | null) ?? null,
          organizer: (e.organizer as string | null) ?? null,
          attendees: (e.attendees as string[]) ?? [],
          startDatetime: new Date(e.startDatetime as string),
          endDatetime: new Date(e.endDatetime as string),
          isAllDay: Boolean(e.isAllDay),
          status: (e.status as 'confirmed' | 'tentative') || 'confirmed',
        }))
        resolve(events)
      } catch (err) {
        reject(new Error(`Failed to parse Python output: ${stdout.slice(0, 200)}`))
      }
    })

    py.on('error', (err) => {
      reject(new Error(`Failed to spawn python3: ${err.message}`))
    })
  })
}

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

    const now = new Date()
    // Sync window: 7 days back to 60 days ahead
    const syncStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const syncEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)

    // Parse via Python: RFC-5545 RRULE expansion, ACCEPTED-only attendee filter
    const parsed = await parseIcalPython(rawIcal, user?.email ?? undefined, syncStart, syncEnd)

    // Only include events within the sync window (Python already filters, but be safe)
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
    // Handles events moved from an old date to a new one.
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
          organizer: e.organizer,
          attendees: e.attendees,
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
