'use client'
import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { cn, minutesToHours } from '@/lib/utils'
import { BarChart3, Clock, CheckCircle2, Calendar, TrendingUp, Repeat } from 'lucide-react'

type Range = '7d' | '30d' | '90d'

interface DayData {
  date: string
  taskMinutes: number
  meetingMinutes: number
  plannedMinutes: number
  completedTaskCount: number
  meetingCount: number
}

interface RecurringData {
  title: string
  recurrenceRule: string
  week: { count: number; actualMinutes: number; plannedMinutes: number }
  month: { count: number; actualMinutes: number; plannedMinutes: number }
  quarter: { count: number; actualMinutes: number; plannedMinutes: number }
}

interface Summary {
  totalTaskMinutes: number
  totalMeetingMinutes: number
  totalPlannedMinutes: number
  totalCompletedTasks: number
  range: Range
}

interface AnalyticsData {
  daily: DayData[]
  recurring: RecurringData[]
  summary: Summary
}

interface PeriodData {
  label: string     // "Mon", "Mar 11", "Feb"
  sublabel: string  // "17", "Mar 11 – Mar 17", "February 2026"
  taskMinutes: number
  meetingMinutes: number
  plannedMinutes: number
  isPast: boolean
}

function toPeriods(days: DayData[], range: Range): PeriodData[] {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const currentMonthKey = todayStr.slice(0, 7)

  if (range === '7d') {
    return [...days]
      .sort((a, b) => ((parseISO(a.date).getDay() + 6) % 7) - ((parseISO(b.date).getDay() + 6) % 7))
      .map(day => ({
        label: format(parseISO(day.date), 'EEE'),
        sublabel: format(parseISO(day.date), 'd'),
        taskMinutes: day.taskMinutes,
        meetingMinutes: day.meetingMinutes,
        plannedMinutes: day.plannedMinutes,
        isPast: day.date <= todayStr,
      }))
  }

  const buckets = new Map<string, { key: string; period: PeriodData }>()

  for (const day of days) {
    let key: string, label: string, sublabel: string, isPast: boolean

    if (range === '30d') {
      const d = parseISO(day.date)
      const dow = (d.getDay() + 6) % 7
      const mon = new Date(d); mon.setDate(d.getDate() - dow)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      key = format(mon, 'yyyy-MM-dd')
      label = format(mon, 'MMM d')
      sublabel = `${format(mon, 'MMM d')} – ${format(sun, 'MMM d')}`
      isPast = format(sun, 'yyyy-MM-dd') < todayStr
    } else {
      key = day.date.slice(0, 7)
      label = format(parseISO(day.date), 'MMM')
      sublabel = format(parseISO(day.date), 'MMMM yyyy')
      isPast = key < currentMonthKey
    }

    if (!buckets.has(key)) {
      buckets.set(key, { key, period: { label, sublabel, taskMinutes: 0, meetingMinutes: 0, plannedMinutes: 0, isPast } })
    }
    const b = buckets.get(key)!
    b.period.taskMinutes += day.taskMinutes
    b.period.meetingMinutes += day.meetingMinutes
    b.period.plannedMinutes += day.plannedMinutes
  }

  return [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(b => b.period)
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 flex items-start gap-3">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-stone-400 mb-0.5">{label}</p>
        <p className="text-lg font-semibold text-stone-800 dark:text-stone-100 leading-none">{value}</p>
        {sub && <p className="text-xs text-stone-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function DailyPie({ period }: { period: PeriodData }) {
  const total = period.taskMinutes + period.meetingMinutes
  const r = 30
  const size = 80
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r

  const taskFrac = total > 0 ? period.taskMinutes / total : 0
  const taskDash = taskFrac * circ
  const meetDash = total > 0 ? (period.meetingMinutes / total) * circ : 0

  const pct = period.plannedMinutes > 0
    ? Math.round((period.taskMinutes / period.plannedMinutes) * 100)
    : null

  const taskRotate = -90
  const meetRotate = taskFrac * 360 - 90

  if (!period.isPast) {
    return (
      <div className="flex flex-col items-center flex-1 min-w-0" style={{ minWidth: size }}>
        <div className="flex flex-col items-center justify-center" style={{ width: size, height: size }}>
          <span style={{ fontSize: 28 }}>🐕</span>
        </div>
        <div className="flex flex-col items-center mt-1" style={{ width: size }}>
          <span className="text-xs font-semibold text-stone-600 dark:text-stone-300 text-center leading-tight truncate w-full text-center">{period.label}</span>
          <span className="text-[10px] text-stone-400 text-center leading-tight truncate w-full text-center">{period.sublabel}</span>
          <span className="text-[10px] text-stone-400 italic text-center mt-1">workin on it</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center flex-1 min-w-0" style={{ minWidth: size }}>
      {/* Donut */}
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke="currentColor"
            className="text-stone-200 dark:text-stone-700"
            strokeWidth={8}
          />
          {total > 0 && (
            <>
              <circle
                cx={cx} cy={cy} r={r} fill="none"
                stroke="currentColor"
                className="text-indigo-500 dark:text-indigo-400"
                strokeWidth={8}
                strokeDasharray={`${taskDash} ${circ - taskDash}`}
                transform={`rotate(${taskRotate} ${cx} ${cy})`}
              />
              {period.meetingMinutes > 0 && (
                <circle
                  cx={cx} cy={cy} r={r} fill="none"
                  stroke="currentColor"
                  className="text-blue-400 dark:text-blue-500"
                  strokeWidth={8}
                  strokeDasharray={`${meetDash} ${circ - meetDash}`}
                  transform={`rotate(${meetRotate} ${cx} ${cy})`}
                />
              )}
            </>
          )}
        </svg>
        {/* Center: actual total */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-stone-700 dark:text-stone-200 leading-none tabular-nums">
            {total > 0 ? minutesToHours(total) : ''}
          </span>
        </div>
      </div>

      {/* Period label — fixed height so all donuts stay at same Y */}
      <div className="flex flex-col items-center mt-1 mb-1" style={{ width: size }}>
        <span className="text-xs font-semibold text-stone-600 dark:text-stone-300 text-center leading-tight truncate w-full text-center">{period.label}</span>
        <span className="text-[10px] text-stone-400 text-center leading-tight truncate w-full text-center">{period.sublabel}</span>
      </div>

      {period.isPast && (
        <div className="flex flex-col items-center gap-0.5" style={{ width: size }}>
          {/* Planned vs actual */}
          <div className="w-full border-t border-stone-100 dark:border-stone-800 pt-1 mt-0.5 flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-stone-400">Actual</span>
              <span className="text-[10px] font-medium text-stone-600 dark:text-stone-300 tabular-nums">
                {total > 0 ? minutesToHours(total) : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-stone-400">Planned</span>
              <span className="text-[10px] font-medium text-stone-600 dark:text-stone-300 tabular-nums">
                {period.plannedMinutes > 0 ? minutesToHours(period.plannedMinutes) : '—'}
              </span>
            </div>
            {pct !== null && (
              <div className={cn(
                'text-[10px] font-semibold tabular-nums text-center',
                pct >= 100 ? 'text-emerald-500' :
                pct >= 70 ? 'text-amber-500' : 'text-stone-400'
              )}>
                {pct}%
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RecurringRow({ task, range, barMax }: { task: RecurringData; range: Range; barMax: number }) {
  const data = range === '7d' ? task.week : range === '30d' ? task.month : task.quarter

  const actualW = barMax > 0 ? (data.actualMinutes / barMax) * 100 : 0
  const plannedW = barMax > 0 ? (data.plannedMinutes / barMax) * 100 : 0

  return (
    <div className="py-3 border-b border-stone-100 dark:border-stone-800 last:border-0">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">{task.title}</p>
            <div className="flex items-center gap-4 ml-4 flex-shrink-0">
              <div className="text-right">
                <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">{data.count}×</p>
                <p className="text-[10px] text-stone-400">done</p>
              </div>
              {data.count > 0 && data.actualMinutes > 0 && (
                <div className="text-right">
                  <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                    {minutesToHours(Math.round(data.actualMinutes / data.count))}
                  </p>
                  <p className="text-[10px] text-stone-400">avg</p>
                </div>
              )}
            </div>
          </div>
          {/* Horizontal bars */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-stone-400 w-11 shrink-0 text-right">Actual</span>
              <div className="flex-1 h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full transition-all"
                  style={{ width: `${actualW}%` }}
                />
              </div>
              <span className="text-[10px] text-stone-500 dark:text-stone-400 w-10 shrink-0 tabular-nums">
                {data.actualMinutes > 0 ? minutesToHours(data.actualMinutes) : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-stone-400 w-11 shrink-0 text-right">Planned</span>
              <div className="flex-1 h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-stone-300 dark:bg-stone-600 rounded-full transition-all"
                  style={{ width: `${plannedW}%` }}
                />
              </div>
              <span className="text-[10px] text-stone-500 dark:text-stone-400 w-10 shrink-0 tabular-nums">
                {data.plannedMinutes > 0 ? minutesToHours(data.plannedMinutes) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>('7d')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/analytics?range=${range}`)
      .then(async r => {
        const d = await r.json()
        if (d && Array.isArray(d.daily)) {
          setData(d)
        } else {
          setData(null)
          setError(d?.error ?? `HTTP ${r.status}`)
        }
        setLoading(false)
      })
      .catch(err => {
        setError(String(err))
        setLoading(false)
      })
  }, [range])

  const rangeLabel = range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'Last quarter'
  const breakdownLabel = range === '7d' ? 'Daily breakdown' : range === '30d' ? 'Weekly breakdown' : 'Monthly breakdown'
  const periods = data ? toPeriods(data.daily, range) : []

  // Max bar width reference for recurring tasks
  const recurringBarMax = data?.recurring?.length
    ? Math.max(...data.recurring.map(t => {
        const d = range === '7d' ? t.week : range === '30d' ? t.month : t.quarter
        return Math.max(d.actualMinutes, d.plannedMinutes)
      }), 1)
    : 1

  return (
    <div className="flex-1 overflow-y-auto bg-stone-50 dark:bg-stone-950">
      <div className="max-w-4xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BarChart3 size={20} className="text-indigo-600" />
            <h1 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Analytics</h1>
          </div>
          <div className="flex gap-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-0.5">
            {(['7d', '30d', '90d'] as Range[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-md transition-colors',
                  range === r
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
                )}
              >
                {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-20 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 animate-pulse" />
            ))}
          </div>
        ) : data ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                icon={<Clock size={16} className="text-indigo-600" />}
                label="Task hours"
                value={minutesToHours(data.summary.totalTaskMinutes)}
                sub={rangeLabel}
                color="bg-indigo-50 dark:bg-indigo-950/40"
              />
              <StatCard
                icon={<Calendar size={16} className="text-blue-500" />}
                label="Meeting hours"
                value={minutesToHours(data.summary.totalMeetingMinutes)}
                sub={rangeLabel}
                color="bg-blue-50 dark:bg-blue-950/40"
              />
              <StatCard
                icon={<CheckCircle2 size={16} className="text-emerald-600" />}
                label="Tasks completed"
                value={String(data.summary.totalCompletedTasks)}
                sub={rangeLabel}
                color="bg-emerald-50 dark:bg-emerald-950/40"
              />
              <StatCard
                icon={<TrendingUp size={16} className="text-amber-500" />}
                label="Actual vs planned"
                value={data.summary.totalPlannedMinutes > 0
                  ? `${Math.round((data.summary.totalTaskMinutes / data.summary.totalPlannedMinutes) * 100)}%`
                  : '—'}
                sub="of planned time used"
                color="bg-amber-50 dark:bg-amber-950/40"
              />
            </div>

            {/* Daily pie charts */}
            <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">{breakdownLabel}</h2>
                <div className="flex items-center gap-4 text-xs text-stone-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
                    Tasks
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" />
                    Meetings
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] text-stone-400">% = tasks / planned</span>
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2 overflow-x-auto pb-1">
                {periods.map((p, i) => (
                  <DailyPie key={i} period={p} />
                ))}
              </div>
            </div>

            {/* Recurring tasks */}
            {(data.recurring?.length ?? 0) > 0 && (
              <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Repeat size={15} className="text-stone-400" />
                    <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Recurring tasks</h2>
                  </div>
                  <span className="text-xs text-stone-400">
                    {range === '7d' ? 'This week' : range === '30d' ? 'This month' : 'This quarter'}
                  </span>
                </div>
                {data.recurring.map((task, i) => (
                  <RecurringRow key={i} task={task} range={range} barMax={recurringBarMax} />
                ))}
              </div>
            )}

            {(data.recurring?.length ?? 0) === 0 && data.summary.totalCompletedTasks === 0 && (
              <div className="text-center py-12 text-stone-400">
                <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No data yet for {rangeLabel.toLowerCase()}.</p>
                <p className="text-xs mt-1">Complete tasks to see your analytics.</p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-stone-400 text-sm">
            <p>Failed to load analytics.</p>
            {error && <p className="text-xs mt-1 text-red-400 font-mono">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
