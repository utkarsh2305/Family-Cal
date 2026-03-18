import { CalendarDays } from 'lucide-react'
import type { CalendarEvent, ConflictPair, FamilyMember } from '../../../lib/types'
import { StatusChip } from '../shared/ui'
import EmptyState from '../shared/ui/EmptyState'
import { isToday } from './calendarUtils'
import AgendaEventCard from './AgendaEventCard'

interface Props {
  selectedDate: Date
  events: CalendarEvent[]
  members: FamilyMember[]
  loading: boolean
  allConflicts: ConflictPair[]
  onEventClick: (ev: CalendarEvent) => void
}

function hasConflict(ev: CalendarEvent, allConflicts: ConflictPair[]): boolean {
  return allConflicts.some((c) => c.eventA.id === ev.id || c.eventB.id === ev.id)
}

export default function AgendaPanel({ selectedDate, events, members, loading, allConflicts, onEventClick }: Props) {
  const dateLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div>
      {/* Date heading */}
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-[14px] font-bold text-foreground">{dateLabel}</span>
        {isToday(selectedDate) && (
          <StatusChip label="Today" variant="info" />
        )}
        {events.length > 0 && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-4 py-5 text-muted-foreground text-sm">
          <div className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground shrink-0" />
          Loading…
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled"
          description="No events on this day"
        />
      ) : (
        <div className="px-4 pb-4 space-y-2">
          {events.map((ev) => (
            <AgendaEventCard
              key={ev.id}
              event={ev}
              members={members}
              hasConflict={hasConflict(ev, allConflicts)}
              onClick={() => onEventClick(ev)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
