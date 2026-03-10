export interface User {
  id: string
  name: string
  email: string
  theme: string
  timeIncrement: number
  autoRolloverIncompleteTasks: boolean
  rolloverPosition: string
  hideCompletedTasksToday: boolean
  autoArchiveAfterDays: number
  calendarEventColoring: string
}

export interface Context {
  id: string
  userId: string
  name: string
  type: string
  channels?: Channel[]
}

export interface Channel {
  id: string
  userId: string
  contextId: string | null
  name: string
  color: string
  icon: string | null
  isDefault: boolean
  sortOrder: number
}

export interface Task {
  id: string
  userId: string
  channelId: string | null
  parentTaskId: string | null
  title: string
  notes: string | null
  status: 'incomplete' | 'complete' | 'archived'
  scheduledDate: string | null
  startDate: string | null
  dueDate: string | null
  plannedTimeMinutes: number | null
  actualTimeMinutes: number | null
  timeboxStart: string | null
  timeboxEnd: string | null
  sortOrder: number
  isRecurring: boolean
  recurrenceRule: string | null
  isBacklog: boolean
  isArchived: boolean
  consecutiveRolloverCount: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  channel?: Channel | null
  subtasks?: Task[]
}

export interface Calendar {
  id: string
  userId: string
  name: string
  color: string
  isVisible: boolean
  isDefault: boolean
}

export interface CalendarEvent {
  id: string
  userId: string
  calendarId: string
  channelId: string | null
  title: string
  description: string | null
  location: string | null
  startDatetime: string
  endDatetime: string
  isAllDay: boolean
  color: string | null
  calendar?: Calendar
  channel?: Channel | null
}

export interface TimeEntry {
  id: string
  userId: string
  taskId: string
  startTime: string
  endTime: string | null
  durationMinutes: number | null
}
