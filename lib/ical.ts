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

// Parse a DTSTART or DTEND value into a Date
// Handles: 20260315T090000Z, 20260315T090000, 20260315 (all-day)
function parseDate(val: string): { date: Date; isAllDay: boolean } {
  const cleaned = val.split(';').pop()! // strip TZID= prefix if present via property param
  if (/^\d{8}$/.test(cleaned)) {
    // All-day: YYYYMMDD
    const y = +cleaned.slice(0, 4), m = +cleaned.slice(4, 6) - 1, d = +cleaned.slice(6, 8)
    return { date: new Date(y, m, d, 0, 0, 0), isAllDay: true }
  }
  // Datetime: YYYYMMDDTHHMMSS[Z]
  const y = +cleaned.slice(0, 4), mo = +cleaned.slice(4, 6) - 1, d = +cleaned.slice(6, 8)
  const h = +cleaned.slice(9, 11), min = +cleaned.slice(11, 13), s = +cleaned.slice(13, 15)
  const isUtc = cleaned.endsWith('Z')
  return {
    date: isUtc ? new Date(Date.UTC(y, mo, d, h, min, s)) : new Date(y, mo, d, h, min, s),
    isAllDay: false,
  }
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
        // Get property name (before first : or ;)
        const get = (key: string): string => {
          // Match exact key or key with params (e.g. DTSTART;TZID=...)
          const entry = Object.entries(props).find(([k]) => k === key || k.startsWith(key + ';'))
          return entry ? entry[1] : ''
        }

        const startRaw = get('DTSTART')
        const endRaw = get('DTEND')
        if (!startRaw) continue

        // For DTSTART;VALUE=DATE or DTSTART;TZID=..., the value part after last : is the date
        const startParsed = parseDate(startRaw)
        const endParsed = endRaw ? parseDate(endRaw) : startParsed

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
