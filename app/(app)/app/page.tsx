import KanbanBoard from '@/components/kanban/KanbanBoard'
import TodayCalendarPanel from '@/components/calendar/TodayCalendarPanel'

export default function AppPage() {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <KanbanBoard />
      </div>
      <TodayCalendarPanel />
    </div>
  )
}
