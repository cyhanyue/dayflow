import { type ClassValue, clsx } from 'clsx'
import { format, startOfWeek, addDays, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function getWeekDays(date: Date = new Date()): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 }) // Monday
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'yyyy-MM-dd')
}

export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'EEE, MMM d')
}

export function minutesToHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// Returns the next occurrence date (YYYY-MM-DD) after fromDate based on the recurrence rule.
// rule format: {"freq":"daily"} | {"freq":"weekly","days":[0-6]} | {"freq":"monthly","dayOfMonth":1-31}
// days uses JS getDay() convention: 0=Sun, 1=Mon, ..., 6=Sat
export function getNextOccurrence(rule: string, fromDate: string): string {
  const parsed = JSON.parse(rule) as { freq: string; days?: number[]; dayOfMonth?: number }
  const [y, m, d] = fromDate.split('-').map(Number)

  function toISO(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  if (parsed.freq === 'daily') {
    return toISO(new Date(y, m - 1, d + 1))
  }

  if (parsed.freq === 'weekly' && parsed.days?.length) {
    const days = parsed.days
    let next = new Date(y, m - 1, d + 1)
    for (let i = 0; i < 8; i++) {
      if (days.includes(next.getDay())) return toISO(next)
      next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1)
    }
  }

  if (parsed.freq === 'monthly') {
    const dom = parsed.dayOfMonth ?? d
    let ny = y, nm = m + 1
    if (nm > 12) { nm = 1; ny++ }
    const daysInMonth = new Date(ny, nm, 0).getDate()
    return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(dom, daysInMonth)).padStart(2, '0')}`
  }

  return fromDate
}
