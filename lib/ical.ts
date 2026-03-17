export interface ICalEvent {
  uid: string | null
  title: string
  description: string | null
  location: string | null
  startDatetime: Date
  endDatetime: Date
  isAllDay: boolean
  status: 'confirmed' | 'tentative'
}

// Unfold iCal lines (lines continuation: \r\n followed by space or tab)
function unfold(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

// Unescape iCal text values
function unescape(val: string): string {
  return val.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

// Convert a naive local datetime (in tzid) to UTC using Intl
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
    const offset = candidateUtc.getTime() - tzAsUtc
    return new Date(Date.UTC(y, mo, d, h, min, s) + offset)
  } catch {
    return candidateUtc
  }
}

function parseDate(key: string, val: string): { date: Date; isAllDay: boolean } {
  if (/^\d{8}$/.test(val)) {
    const y = +val.slice(0, 4), m = +val.slice(4, 6) - 1, d = +val.slice(6, 8)
    return { date: new Date(Date.UTC(y, m, d)), isAllDay: true }
  }
  const y = +val.slice(0, 4), mo = +val.slice(4, 6) - 1, d = +val.slice(6, 8)
  const h = +val.slice(9, 11), min = +val.slice(11, 13), s = +val.slice(13, 15)
  if (val.endsWith('Z')) {
    return { date: new Date(Date.UTC(y, mo, d, h, min, s)), isAllDay: false }
  }
  const tzidMatch = key.match(/TZID=([^;:]+)/)
  if (tzidMatch) {
    return { date: localToUtc(y, mo, d, h, min, s, tzidMatch[1]), isAllDay: false }
  }
  return { date: new Date(Date.UTC(y, mo, d, h, min, s)), isAllDay: false }
}

/**
 * Detect the calendar owner's email by finding the most frequent ATTENDEE address.
 * In a personal Google Calendar ICS export the owner appears as an attendee in
 * virtually every multi-person event, making them the clear frequency winner.
 */
function detectOwnerEmail(lines: string[]): string | null {
  const counts = new Map<string, number>()
  for (const line of lines) {
    if (line !== 'ATTENDEE' && !line.startsWith('ATTENDEE;')) continue
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const email = line.slice(colonIdx + 1).toLowerCase().replace(/^mailto:/, '').trim()
    if (email && email.includes('@')) {
      counts.set(email, (counts.get(email) ?? 0) + 1)
    }
  }
  if (counts.size === 0) return null
  let best: string | null = null
  let max = 0
  for (const [email, count] of counts) {
    if (count > max) { max = count; best = email }
  }
  return best
}

/**
 * Parse an iCal feed.
 * @param raw - raw iCal text
 * @param userEmail - optional hint; the owner's email is also auto-detected from the feed
 */
export function parseIcal(raw: string, userEmail?: string): ICalEvent[] {
  const text = unfold(raw)
  const lines = text.split(/\r?\n/)
  const events: ICalEvent[] = []
  // Parallel array: RECURRENCE-ID date for each event (null = master/standalone)
  const recurrenceIds: (Date | null)[] = []

  // Build a set of candidate owner emails: the Dayflow login email (hint) plus
  // the frequency-detected calendar identity. Using a set means we catch cases
  // where the two differ (e.g. personal Gmail login vs work Google Calendar).
  const detectedEmail = detectOwnerEmail(lines)
  const ownerEmails = new Set<string>(
    [userEmail?.toLowerCase().trim(), detectedEmail].filter((e): e is string => !!e)
  )

  let inEvent = false
  let props: Record<string, string> = {}
  // Collect attendees separately since a VEVENT can have multiple
  let attendees: Array<{ key: string; val: string }> = []

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      props = {}
      attendees = []
      continue
    }
    if (line === 'END:VEVENT') {
      inEvent = false
      try {
        const getEntry = (propName: string): { key: string; val: string } | null => {
          const entry = Object.entries(props).find(([k]) => k === propName || k.startsWith(propName + ';'))
          return entry ? { key: entry[0], val: entry[1] } : null
        }
        const get = (propName: string): string => getEntry(propName)?.val ?? ''

        const startEntry = getEntry('DTSTART')
        const endEntry = getEntry('DTEND')
        if (!startEntry) continue

        const startParsed = parseDate(startEntry.key, startEntry.val)
        const endParsed = endEntry ? parseDate(endEntry.key, endEntry.val) : startParsed

        const eventStatus = get('STATUS').toUpperCase()

        // Skip hard-cancelled events
        if (eventStatus === 'CANCELLED') continue

        // If the event has attendees, check whether the user should see it
        if (attendees.length > 0) {
          const transp = get('TRANSP').toUpperCase()
          if (ownerEmails.size > 0) {
            const myAttendee = attendees.find(({ val }) => {
              const email = val.toLowerCase().replace(/^mailto:/, '').trim()
              return ownerEmails.has(email)
            })
            if (myAttendee) {
              const keyUpper = myAttendee.key.toUpperCase()
              if (keyUpper.includes('PARTSTAT=DECLINED') || keyUpper.includes('PARTSTAT=NEEDS-ACTION')) {
                continue // User explicitly declined or hasn't responded
              }
            } else if (transp === 'TRANSPARENT') {
              continue // Email not matched; TRANSP:TRANSPARENT signals user is free/declined
            }
          } else if (transp === 'TRANSPARENT') {
            continue // No email available; use TRANSP as proxy for declined
          }
        }

        const status: 'confirmed' | 'tentative' = eventStatus === 'TENTATIVE' ? 'tentative' : 'confirmed'

        // Track RECURRENCE-ID so we can suppress superseded master occurrences later
        const ridEntry = getEntry('RECURRENCE-ID')
        const ridDate = ridEntry ? parseDate(ridEntry.key, ridEntry.val).date : null

        events.push({
          uid: get('UID') || null,
          title: unescape(get('SUMMARY') || '(No title)'),
          description: get('DESCRIPTION') ? unescape(get('DESCRIPTION')) : null,
          location: get('LOCATION') ? unescape(get('LOCATION')) : null,
          startDatetime: startParsed.date,
          endDatetime: endParsed.date,
          isAllDay: startParsed.isAllDay,
          status,
        })
        recurrenceIds.push(ridDate)
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

    // Collect all ATTENDEE lines separately (multi-value property)
    if (key === 'ATTENDEE' || key.startsWith('ATTENDEE;')) {
      attendees.push({ key, val })
    } else {
      props[key] = val
    }
  }

  // Build a set of (uid::recurrenceIdTime) from exception VEVENTs.
  // Each entry represents a master occurrence that has been overridden and should be suppressed.
  const suppressedOccurrences = new Set<string>()
  for (let i = 0; i < events.length; i++) {
    const rid = recurrenceIds[i]
    const uid = events[i].uid
    if (rid && uid) {
      suppressedOccurrences.add(`${uid}::${rid.getTime()}`)
    }
  }

  // Deduplicate: skip master occurrences superseded by RECURRENCE-ID exceptions,
  // and skip exact duplicates (same UID + same start time).
  const seen = new Set<string>()
  return events.filter((e, i) => {
    // If this event IS a RECURRENCE-ID exception, always keep it
    if (recurrenceIds[i]) {
      const key = `${e.uid ?? ''}::${e.startDatetime.getTime()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }
    // If this is a master occurrence that an exception overrides, suppress it
    if (e.uid && suppressedOccurrences.has(`${e.uid}::${e.startDatetime.getTime()}`)) return false
    // Normal deduplication
    const key = `${e.uid ?? ''}::${e.startDatetime.getTime()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
