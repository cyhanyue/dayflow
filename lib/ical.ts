export interface ICalEvent {
  title: string
  description: string | null
  location: string | null
  startDatetime: Date
  endDatetime: Date
  isAllDay: boolean
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
  // Treat the desired local time as if it were UTC, then compute the offset
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
    // Unknown timezone — fall back to UTC
    return candidateUtc
  }
}

// Parse a DTSTART or DTEND property (key + value) into a Date.
// key examples: "DTSTART", "DTSTART;TZID=America/Los_Angeles", "DTSTART;VALUE=DATE"
// val examples: "20260315T090000Z", "20260315T090000", "20260315"
function parseDate(key: string, val: string): { date: Date; isAllDay: boolean } {
  if (/^\d{8}$/.test(val)) {
    // All-day: YYYYMMDD
    const y = +val.slice(0, 4), m = +val.slice(4, 6) - 1, d = +val.slice(6, 8)
    return { date: new Date(Date.UTC(y, m, d)), isAllDay: true }
  }
  // Datetime: YYYYMMDDTHHMMSS[Z]
  const y = +val.slice(0, 4), mo = +val.slice(4, 6) - 1, d = +val.slice(6, 8)
  const h = +val.slice(9, 11), min = +val.slice(11, 13), s = +val.slice(13, 15)
  if (val.endsWith('Z')) {
    return { date: new Date(Date.UTC(y, mo, d, h, min, s)), isAllDay: false }
  }
  // Has TZID — convert from that timezone to UTC
  const tzidMatch = key.match(/TZID=([^;:]+)/)
  if (tzidMatch) {
    return { date: localToUtc(y, mo, d, h, min, s, tzidMatch[1]), isAllDay: false }
  }
  // No timezone info — treat as UTC
  return { date: new Date(Date.UTC(y, mo, d, h, min, s)), isAllDay: false }
}

export function parseIcal(raw: string): ICalEvent[] {
  const text = unfold(raw)
  const lines = text.split(/\r?\n/)
  const events: ICalEvent[] = []

  let inEvent = false
  let props: Record<string, string> = {}

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      props = {}
      continue
    }
    if (line === 'END:VEVENT') {
      inEvent = false
      try {
        // Get property value and full key (e.g. DTSTART;TZID=America/Los_Angeles)
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

        // Skip cancelled or tentative events (not accepted by the user)
        const status = get('STATUS')
        if (status === 'CANCELLED' || status === 'TENTATIVE') continue

        events.push({
          title: unescape(get('SUMMARY') || '(No title)'),
          description: get('DESCRIPTION') ? unescape(get('DESCRIPTION')) : null,
          location: get('LOCATION') ? unescape(get('LOCATION')) : null,
          startDatetime: startParsed.date,
          endDatetime: endParsed.date,
          isAllDay: startParsed.isAllDay,
        })
      } catch {
        // Skip malformed events
      }
      continue
    }
    if (!inEvent) continue

    // Split on first colon, keeping everything after as the value
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx)
    const val = line.slice(colonIdx + 1)
    props[key] = val
  }

  return events
}
