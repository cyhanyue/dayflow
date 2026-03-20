export interface ICalEvent {
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

// Unfold iCal lines (continuation lines start with space or tab)
function unfold(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function unescape(val: string): string {
  return val.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

// Convert a naive local datetime in tzid to UTC using Intl
function localToUtc(y: number, mo: number, d: number, h: number, min: number, s: number, tzid: string): Date {
  const candidateUtc = new Date(Date.UTC(y, mo, d, h, min, s))
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(candidateUtc)
    const get = (type: string) => +parts.find(p => p.type === type)!.value
    const tzAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
    return new Date(Date.UTC(y, mo, d, h, min, s) + (candidateUtc.getTime() - tzAsUtc))
  } catch {
    return candidateUtc
  }
}

function parseDate(key: string, val: string): { date: Date; isAllDay: boolean } {
  // All-day: YYYYMMDD
  if (/^\d{8}$/.test(val)) {
    const y = +val.slice(0, 4), m = +val.slice(4, 6) - 1, d = +val.slice(6, 8)
    return { date: new Date(Date.UTC(y, m, d)), isAllDay: true }
  }
  const y = +val.slice(0, 4), mo = +val.slice(4, 6) - 1, d = +val.slice(6, 8)
  const h = +val.slice(9, 11), min = +val.slice(11, 13), s = +(val.slice(13, 15) || 0)
  if (val.endsWith('Z')) return { date: new Date(Date.UTC(y, mo, d, h, min, s)), isAllDay: false }
  const tzidMatch = key.match(/TZID=([^;:]+)/)
  if (tzidMatch) return { date: localToUtc(y, mo, d, h, min, s, tzidMatch[1]), isAllDay: false }
  return { date: new Date(Date.UTC(y, mo, d, h, min, s)), isAllDay: false }
}

/**
 * Detect the calendar owner's email by finding the most frequent ATTENDEE address.
 */
function detectOwnerEmail(lines: string[]): string | null {
  const counts = new Map<string, number>()
  for (const line of lines) {
    if (line !== 'ATTENDEE' && !line.startsWith('ATTENDEE;')) continue
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const email = line.slice(colonIdx + 1).toLowerCase().replace(/^mailto:/, '').trim()
    if (email && email.includes('@')) counts.set(email, (counts.get(email) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  let best: string | null = null, max = 0
  for (const [email, count] of counts) {
    if (count > max) { max = count; best = email }
  }
  return best
}

// iCal day-of-week names indexed by JS getUTCDay() (0=Sun … 6=Sat)
const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/**
 * Expand an RRULE string into concrete UTC occurrences within [winStart, winEnd].
 * exdates: set of UTC timestamps that should be excluded (still counted for COUNT).
 */
function expandRRule(
  dtstart: Date,
  rruleStr: string,
  exdates: Set<number>,
  winStart: Date,
  winEnd: Date,
): Date[] {
  const p: Record<string, string> = {}
  for (const part of rruleStr.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0) p[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1)
  }

  const freq = p.FREQ ?? ''
  const interval = Math.max(1, parseInt(p.INTERVAL ?? '1'))
  const byDay: string[] = p.BYDAY ? p.BYDAY.split(',').map(s => s.trim()) : []
  const byMonthDay: number[] = p.BYMONTHDAY ? p.BYMONTHDAY.split(',').map(Number) : []
  let until: Date | null = null
  if (p.UNTIL) { try { until = parseDate('UNTIL', p.UNTIL).date } catch { /* ignore */ } }
  const maxCount = p.COUNT ? parseInt(p.COUNT) : null

  const hardEnd = until ? new Date(Math.min(until.getTime(), winEnd.getTime())) : winEnd
  const results: Date[] = []
  let nGenerated = 0 // counts ALL occurrences from dtstart (for COUNT compliance)

  // Returns false when iteration should stop
  function tryAdd(d: Date): boolean {
    if (d < dtstart) return true // before series start — skip without counting
    if (maxCount !== null && nGenerated >= maxCount) return false
    if (d > hardEnd) return false
    nGenerated++
    if (d >= winStart && !exdates.has(d.getTime())) results.push(new Date(d))
    return true
  }

  const H = dtstart.getUTCHours()
  const MIN = dtstart.getUTCMinutes()
  const SEC = dtstart.getUTCSeconds()

  if (freq === 'DAILY') {
    for (
      let cur = new Date(dtstart);
      cur.getTime() <= hardEnd.getTime();
      cur = new Date(cur.getTime() + interval * 86400000)
    ) {
      if (!tryAdd(cur)) break
    }

  } else if (freq === 'WEEKLY') {
    // Days of week to generate (defaults to dtstart's weekday if BYDAY absent)
    const targetDows = byDay.length > 0
      ? [...new Set(byDay.map(d => DOW.indexOf(d.replace(/^[+-]?\d+/, '').toUpperCase())))].filter(d => d >= 0)
      : [dtstart.getUTCDay()]

    // Anchor: the Sunday (DOW=0) of the week containing dtstart, keeping same HH:MM:SS
    const sunMs = Date.UTC(
      dtstart.getUTCFullYear(), dtstart.getUTCMonth(),
      dtstart.getUTCDate() - dtstart.getUTCDay(),
      H, MIN, SEC,
    )

    for (let wi = 0; wi <= 10000; wi++) {
      const weekBaseMs = sunMs + wi * interval * 7 * 86400000
      if (weekBaseMs > hardEnd.getTime() + 7 * 86400000) break
      for (const dow of [...targetDows].sort((a, b) => a - b)) {
        const occ = new Date(weekBaseMs + dow * 86400000)
        if (occ < dtstart) continue
        if (!tryAdd(occ)) return results
      }
    }

  } else if (freq === 'MONTHLY') {
    for (let mi = 0; mi <= 10000; mi++) {
      const totalMonths = dtstart.getUTCMonth() + mi * interval
      const yr = dtstart.getUTCFullYear() + Math.floor(totalMonths / 12)
      const mo = ((totalMonths % 12) + 12) % 12
      if (new Date(Date.UTC(yr, mo, 1, H, MIN, SEC)) > hardEnd) break

      const daysInMo = new Date(Date.UTC(yr, mo + 1, 0)).getUTCDate()
      const occs: Date[] = []

      if (byMonthDay.length > 0) {
        for (const dom of byMonthDay) {
          const actual = dom < 0 ? daysInMo + dom + 1 : dom
          if (actual >= 1 && actual <= daysInMo) {
            occs.push(new Date(Date.UTC(yr, mo, actual, H, MIN, SEC)))
          }
        }
      } else if (byDay.length > 0) {
        for (const spec of byDay) {
          const m = spec.match(/^([+-]?\d+)?([A-Z]{2})$/i)
          if (!m) continue
          const ord = m[1] ? parseInt(m[1]) : 0
          const dow = DOW.indexOf(m[2].toUpperCase())
          if (dow < 0) continue
          const firstDow = new Date(Date.UTC(yr, mo, 1)).getUTCDay()
          const firstDom = 1 + ((dow - firstDow + 7) % 7)
          if (ord === 0) {
            for (let dom = firstDom; dom <= daysInMo; dom += 7) {
              occs.push(new Date(Date.UTC(yr, mo, dom, H, MIN, SEC)))
            }
          } else if (ord > 0) {
            const dom = firstDom + (ord - 1) * 7
            if (dom <= daysInMo) occs.push(new Date(Date.UTC(yr, mo, dom, H, MIN, SEC)))
          } else {
            const lastDom = firstDom + Math.floor((daysInMo - firstDom) / 7) * 7
            const dom = lastDom + (ord + 1) * 7
            if (dom >= 1) occs.push(new Date(Date.UTC(yr, mo, dom, H, MIN, SEC)))
          }
        }
      } else {
        // Default: same day-of-month as dtstart
        const dom = dtstart.getUTCDate()
        if (dom <= daysInMo) occs.push(new Date(Date.UTC(yr, mo, dom, H, MIN, SEC)))
      }

      for (const occ of occs.sort((a, b) => a.getTime() - b.getTime())) {
        if (!tryAdd(occ)) return results
      }
    }

  } else if (freq === 'YEARLY') {
    for (let yi = 0; yi <= 200; yi++) {
      const yr = dtstart.getUTCFullYear() + yi * interval
      const occ = new Date(Date.UTC(yr, dtstart.getUTCMonth(), dtstart.getUTCDate(), H, MIN, SEC))
      if (!tryAdd(occ)) break
    }
  }

  return results
}

// Parse EXDATE property: one or more comma-separated datetimes sharing the same TZID key
function parseExdates(key: string, val: string): Date[] {
  return val.split(',').flatMap(v => {
    try { return [parseDate(key, v.trim()).date] } catch { return [] }
  })
}

/**
 * Parse an iCal feed into a flat list of concrete event occurrences.
 * Recurring events (RRULE) are expanded into individual occurrences within the window.
 * @param userEmail  - hint for owner email (owner's PARTSTAT=DECLINED events are filtered)
 * @param windowStart / windowEnd - expansion window (defaults: -30d to +90d from now)
 */
export function parseIcal(
  raw: string,
  userEmail?: string,
  windowStart?: Date,
  windowEnd?: Date,
): ICalEvent[] {
  const winStart = windowStart ?? new Date(Date.now() - 30 * 86400000)
  const winEnd   = windowEnd   ?? new Date(Date.now() + 90 * 86400000)

  const text = unfold(raw)
  const lines = text.split(/\r?\n/)

  const events: ICalEvent[] = []
  // Parallel array: RECURRENCE-ID date for each event (null = master/standalone/expanded)
  const recurrenceIds: (Date | null)[] = []

  const detectedEmail = detectOwnerEmail(lines)
  const ownerEmails = new Set<string>(
    [userEmail?.toLowerCase().trim(), detectedEmail].filter((e): e is string => !!e)
  )

  let inEvent = false
  let props: Record<string, string> = {}
  let attendees: Array<{ key: string; val: string }> = []
  let exdates: Date[] = []

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true; props = {}; attendees = []; exdates = []
      continue
    }

    if (line === 'END:VEVENT') {
      inEvent = false
      try {
        const getEntry = (name: string): { key: string; val: string } | null => {
          const e = Object.entries(props).find(([k]) => k === name || k.startsWith(name + ';'))
          return e ? { key: e[0], val: e[1] } : null
        }
        const get = (name: string) => getEntry(name)?.val ?? ''

        const startEntry = getEntry('DTSTART')
        const endEntry   = getEntry('DTEND')
        if (!startEntry) continue

        const startParsed = parseDate(startEntry.key, startEntry.val)
        const endParsed   = endEntry ? parseDate(endEntry.key, endEntry.val) : startParsed
        const duration    = endParsed.date.getTime() - startParsed.date.getTime()

        // Skip hard-cancelled events
        if (get('STATUS').toUpperCase() === 'CANCELLED') continue

        // Attendee / visibility filter.
        // If we can find the owner's ATTENDEE entry, use PARTSTAT directly:
        //   DECLINED or NEEDS-ACTION (no response yet) → hide
        //   ACCEPTED / TENTATIVE → show
        // If the owner's email isn't matched, fall back to TRANSP:
        //   TRANSPARENT → hide (Google sets this when user isn't committed)
        if (attendees.length > 0) {
          if (ownerEmails.size > 0) {
            const mine = attendees.find(({ val }) =>
              ownerEmails.has(val.toLowerCase().replace(/^mailto:/, '').trim())
            )
            if (mine) {
              const k = mine.key.toUpperCase()
              if (k.includes('PARTSTAT=DECLINED') || k.includes('PARTSTAT=NEEDS-ACTION')) continue
            } else if (get('TRANSP').toUpperCase() === 'TRANSPARENT') {
              continue
            }
          } else if (get('TRANSP').toUpperCase() === 'TRANSPARENT') {
            continue
          }
        }

        const status: 'confirmed' | 'tentative' =
          get('STATUS').toUpperCase() === 'TENTATIVE' ? 'tentative' : 'confirmed'
        const uid         = get('UID') || null
        const title       = unescape(get('SUMMARY') || '(No title)')
        const description = get('DESCRIPTION') ? unescape(get('DESCRIPTION')) : null
        const location    = get('LOCATION')    ? unescape(get('LOCATION'))    : null
        const isAllDay    = startParsed.isAllDay

        // Extract organizer display name
        const organizerEntry = getEntry('ORGANIZER')
        let organizer: string | null = null
        if (organizerEntry) {
          const cnMatch = organizerEntry.key.match(/CN=([^;:]+)/i)
          organizer = cnMatch ? unescape(cnMatch[1].trim()) : organizerEntry.val.replace(/^mailto:/i, '').trim() || null
        }

        // Format attendees as display names (CN) or emails, excluding declined
        const formattedAttendees = attendees
          .filter(a => !a.key.toUpperCase().includes('PARTSTAT=DECLINED'))
          .map(a => {
            const cnMatch = a.key.match(/CN=([^;:]+)/i)
            if (cnMatch) return unescape(cnMatch[1].trim())
            return a.val.replace(/^mailto:/i, '').trim()
          })
          .filter(Boolean) as string[]

        const ridEntry  = getEntry('RECURRENCE-ID')
        const ridDate   = ridEntry ? parseDate(ridEntry.key, ridEntry.val).date : null
        const rruleEntry = getEntry('RRULE')

        if (rruleEntry && !ridDate) {
          // ── Recurring master: expand RRULE into individual occurrences ──
          const exdateSet = new Set(exdates.map(d => d.getTime()))
          const occurrences = expandRRule(startParsed.date, rruleEntry.val, exdateSet, winStart, winEnd)
          for (const occ of occurrences) {
            events.push({
              uid, title, description, location, organizer, attendees: formattedAttendees,
              startDatetime: occ,
              endDatetime: new Date(occ.getTime() + duration),
              isAllDay, status,
            })
            recurrenceIds.push(null) // expanded occurrences are treated as master instances
          }
        } else {
          // ── Single event or exception VEVENT (has RECURRENCE-ID) ──
          events.push({ uid, title, description, location, organizer, attendees: formattedAttendees, startDatetime: startParsed.date, endDatetime: endParsed.date, isAllDay, status })
          recurrenceIds.push(ridDate)
        }
      } catch {
        // Skip malformed events
      }
      continue
    }

    if (!inEvent) continue

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx)
    const val = line.slice(colonIdx + 1)

    if (key === 'ATTENDEE' || key.startsWith('ATTENDEE;')) {
      attendees.push({ key, val })
    } else if (key === 'EXDATE' || key.startsWith('EXDATE;')) {
      exdates.push(...parseExdates(key, val))
    } else {
      props[key] = val
    }
  }

  // Build suppressed set: RECURRENCE-ID exceptions override specific master occurrences
  const suppressedOccurrences = new Set<string>()
  for (let i = 0; i < events.length; i++) {
    const rid = recurrenceIds[i]
    const uid = events[i].uid
    if (rid && uid) suppressedOccurrences.add(`${uid}::${rid.getTime()}`)
  }

  // Final filter: deduplicate and remove master occurrences overridden by exceptions
  const seen = new Set<string>()
  return events.filter((e, i) => {
    if (recurrenceIds[i]) {
      // Exception VEVENT — keep, dedup by uid::start
      const key = `${e.uid ?? ''}::${e.startDatetime.getTime()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }
    // Master/expanded occurrence — suppress if an exception overrides this date
    if (e.uid && suppressedOccurrences.has(`${e.uid}::${e.startDatetime.getTime()}`)) return false
    const key = `${e.uid ?? ''}::${e.startDatetime.getTime()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
