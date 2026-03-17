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
  week: { count: number; minutes: number }
  month: { count: number; minutes: number }
  quarter: { count: number; minutes: number }
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

function DailyBar({ day, maxMinutes }: { day: DayData; maxMinutes: number }) {
  const total = day.taskMinutes + day.meetingMinutes
  const barHeight = 80
  const taskH = maxMinutes > 0 ? (day.taskMinutes / maxMinutes) * barHeight : 0
  const meetingH = maxMinutes > 0 ? (day.meetingMinutes / maxMinutes) * barHeight : 0
  const plannedH = maxMinutes > 0 ? Math.min((day.plannedMinutes / maxMinutes) * barHeight, barHeight) : 0
  const dateLabel = format(parseISO(day.date), 'EEE')
  const dateNum = format(parseISO(day.date), 'd')

  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
      {/* Bar */}
      <div className="relative flex items-end gap-0.5" style={{ height: barHeight }}>
        {/* Planned line indicator */}
        {plannedH > 0 && (
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-stone-300 dark:border-stone-600 pointer-events-none z-10"
            style={{ bottom: plannedH }}
            title={`Planned: ${minutesToHours(day.plannedMinutes)}`}
          />
        )}
        {/* Task bar */}
        <div
          className="w-4 bg-indigo-500 dark:bg-indigo-400 rounded-t transition-all"
          style={{ height: Math.max(taskH, total > 0 ? 2 : 0) }}
          title={`Tasks: ${minutesToHours(day.taskMinutes)}`}
        />
        {/* Meeting bar */}
        <div
          className="w-4 bg-blue-400 dark:bg-blue-500 rounded-t transition-all"
          style={{ height: Math.max(meetingH, day.meetingMinutes > 0 ? 2 : 0) }}
          title={`Meetings: ${minutesToHours(day.meetingMinutes)}`}
        />
      </div>
      {/* Total label */}
      <span className="text-[10px] text-stone-400 tabular-nums">
        {total > 0 ? minutesToHours(total) : '—'}
      </span>
      {/* Day label */}
      <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400">{dateLabel}</span>
      <span className="text-[10px] text-stone-400">{dateNum}</span>
    </div>
  )
}

function RecurringRow({ task, range }: { task: RecurringData; range: Range }) {
  const data = range === '7d' ? task.week : range === '30d' ? task.month : task.quarter
  const allData = task.quarter

  return (
    <div className="flex items-center gap-4 py-3 border-b border-stone-100 dark:border-stone-800 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">{task.title}</p>
        <p className="text-xs text-stone-400 mt-0.5">
          {allData.count}× total · {minutesToHours(allData.minutes)} this quarter
        </p>
      </div>
      <div className="flex items-center gap-6 flex-shrink-0">
        <div className="text-right">
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">{data.count}×</p>
          <p className="text-[10px] text-stone-400">completions</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">{minutesToHours(data.minutes)}</p>
          <p className="text-[10px] text-stone-400">time spent</p>
        </div>
        {data.count > 0 && (
          <div className="text-right">
            <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
              {minutesToHours(Math.round(data.minutes / data.count))}
            </p>
            <p className="text-[10px] text-stone-400">avg / session</p>
          </div>
        )}
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

  const maxMinutes = data?.daily?.length
    ? data.daily.reduce((max, d) => Math.max(max, d.taskMinutes + d.meetingMinutes), 1)
    : 1

  const rangeLabel = range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'Last quarter'

  return (
    <div className="flex-1 overflow-y-auto bg-stone-50 dark:bg-stone-950">
      <div className="max-w-4xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BarChart3 size={20} className="text-indigo-600" />
            <h1 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Analytics</h1>
          </div>
          {/* Range selector */}
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

            {/* Daily bar chart */}
            <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Daily breakdown</h2>
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
                    <span className="w-3 border-t-2 border-dashed border-stone-400 inline-block" />
                    Planned
                  </span>
                </div>
              </div>
              <div className="flex items-end gap-1 overflow-x-auto pb-1">
                {data.daily.map(day => (
                  <DailyBar key={day.date} day={day} maxMinutes={maxMinutes} />
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
                    Showing {range === '7d' ? 'this week' : range === '30d' ? 'this month' : 'this quarter'}
                  </span>
                </div>
                {/* Column headers */}
                <div className="flex items-center gap-4 pb-2 border-b border-stone-100 dark:border-stone-800 mb-1">
                  <p className="flex-1 text-xs text-stone-400">Task</p>
                  <div className="flex gap-6 flex-shrink-0 text-right">
                    <p className="text-xs text-stone-400 w-16">Done</p>
                    <p className="text-xs text-stone-400 w-16">Time</p>
                    <p className="text-xs text-stone-400 w-16">Avg</p>
                  </div>
                </div>
                {data.recurring.map((task, i) => (
                  <RecurringRow key={i} task={task} range={range} />
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
