import { create } from 'zustand'
import { Task, Channel, Context, Calendar, CalendarEvent, User } from '@/types'

interface AppState {
  user: User | null
  tasks: Task[]
  channels: Channel[]
  contexts: Context[]
  calendars: Calendar[]
  events: CalendarEvent[]
  activeTaskId: string | null
  activeContextId: string | null
  currentWeekStart: Date
  isBacklogOpen: boolean
  view: 'day' | '3day' | 'week' | 'month'
  calendarDate: Date
  activeTimerTaskId: string | null
  timerStartedAt: number | null

  setUser: (user: User | null) => void
  setTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  removeTask: (id: string) => void
  removeTasks: (ids: string[]) => void
  setChannels: (channels: Channel[]) => void
  setContexts: (contexts: Context[]) => void
  setCalendars: (calendars: Calendar[]) => void
  setEvents: (events: CalendarEvent[]) => void
  setActiveTaskId: (id: string | null) => void
  setActiveContextId: (id: string | null) => void
  setCurrentWeekStart: (date: Date) => void
  setBacklogOpen: (open: boolean) => void
  setView: (view: 'day' | '3day' | 'week' | 'month') => void
  setCalendarDate: (date: Date) => void
  startTimer: (taskId: string) => void
  stopTimer: () => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  tasks: [],
  channels: [],
  contexts: [],
  calendars: [],
  events: [],
  activeTaskId: null,
  activeContextId: null,
  currentWeekStart: new Date(),
  isBacklogOpen: false,
  view: 'week' as const,
  calendarDate: new Date(),
  activeTimerTaskId: null,
  timerStartedAt: null,

  setUser: (user) => set({ user }),
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),
  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  removeTasks: (ids) => set((s) => ({ tasks: s.tasks.filter((t) => !ids.includes(t.id)) })),
  setChannels: (channels) => set({ channels }),
  setContexts: (contexts) => set({ contexts }),
  setCalendars: (calendars) => set({ calendars }),
  setEvents: (events) => set({ events }),
  setActiveTaskId: (id) => set({ activeTaskId: id }),
  setActiveContextId: (id) => set({ activeContextId: id }),
  setCurrentWeekStart: (date) => set({ currentWeekStart: date }),
  setBacklogOpen: (open) => set({ isBacklogOpen: open }),
  setView: (view) => set({ view }),
  setCalendarDate: (date) => set({ calendarDate: date }),
  startTimer: (taskId) => set({ activeTimerTaskId: taskId, timerStartedAt: Date.now() }),
  stopTimer: () => set({ activeTimerTaskId: null, timerStartedAt: null }),
}))
