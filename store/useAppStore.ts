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
  timerTaskTitle: string | null   // stored so it's visible on any page
  timerStartedAt: number | null   // null when paused
  timerAccumulatedMs: number      // ms accumulated from previous runs/pauses
  isTimerPaused: boolean
  syncKey: number

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
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => void
  setActiveTaskId: (id: string | null) => void
  setActiveContextId: (id: string | null) => void
  setCurrentWeekStart: (date: Date) => void
  setBacklogOpen: (open: boolean) => void
  setView: (view: 'day' | '3day' | 'week' | 'month') => void
  setCalendarDate: (date: Date) => void
  startTimer: (taskId: string, title: string) => void
  pauseTimer: () => void
  resumeTimer: () => void
  stopTimer: () => void
  bumpSyncKey: () => void
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
  timerTaskTitle: null,
  timerStartedAt: null,
  timerAccumulatedMs: 0,
  isTimerPaused: false,
  syncKey: 0,

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
  updateEvent: (id, updates) =>
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),
  setActiveTaskId: (id) => set({ activeTaskId: id }),
  setActiveContextId: (id) => set({ activeContextId: id }),
  setCurrentWeekStart: (date) => set({ currentWeekStart: date }),
  setBacklogOpen: (open) => set({ isBacklogOpen: open }),
  setView: (view) => set({ view }),
  setCalendarDate: (date) => set({ calendarDate: date }),
  startTimer: (taskId, title) => set({
    activeTimerTaskId: taskId,
    timerTaskTitle: title,
    timerStartedAt: Date.now(),
    timerAccumulatedMs: 0,
    isTimerPaused: false,
  }),
  pauseTimer: () => set(s => ({
    timerAccumulatedMs: s.timerAccumulatedMs + (s.timerStartedAt ? Date.now() - s.timerStartedAt : 0),
    timerStartedAt: null,
    isTimerPaused: true,
  })),
  resumeTimer: () => set({
    timerStartedAt: Date.now(),
    isTimerPaused: false,
  }),
  stopTimer: () => set({
    activeTimerTaskId: null,
    timerTaskTitle: null,
    timerStartedAt: null,
    timerAccumulatedMs: 0,
    isTimerPaused: false,
  }),
  bumpSyncKey: () => set(s => ({ syncKey: s.syncKey + 1 })),
}))
