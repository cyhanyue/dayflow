import KanbanBoard from '@/components/kanban/KanbanBoard'
import TodayCalendarPanel from '@/components/calendar/TodayCalendarPanel'

export default function AppPage() {
  return (
    <div className="h-full overflow-hidden">
      <KanbanBoard />
      <TodayCalendarPanel />
    </div>
  )
}
