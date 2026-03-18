import { AlertTriangle, Clock, MapPin } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { CalendarEvent, FamilyMember } from '../../../lib/types'
import { StatusChip } from '../shared/ui'
import { formatTime, getCreatorInitials } from './calendarUtils'

type EventStatus = 'detected' | 'confirmed' | 'added'

interface Props {
  event: CalendarEvent
  members: FamilyMember[]
  hasConflict: boolean
  onClick: () => void
  // Future-ready — not populated yet by current backend
  eventStatus?: EventStatus
  eventSource?: string
}

const STATUS_CHIP: Record<EventStatus, { label: string; variant: 'info' | 'default' | 'success' }> = {
  detected:  { label: 'Detected',  variant: 'info' },
  confirmed: { label: 'Confirmed', variant: 'default' },
  added:     { label: 'Added',     variant: 'success' },
}

export default function AgendaEventCard({ event, members, hasConflict, onClick, eventStatus, eventSource }: Props) {
  const color    = event.creatorColor ?? '#4F46E5'
  const initials = getCreatorInitials(event, members)
  const timeLabel = event.isAllDay
    ? 'All day'
    : `${formatTime(event.startAt)} – ${formatTime(event.endAt)}`
  const chip = eventStatus ? STATUS_CHIP[eventStatus] : null

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      role="button"
      tabIndex={0}
      className={cn(
        'group relative flex items-stretch bg-card rounded-xl border border-border overflow-hidden',
        'cursor-pointer transition-all duration-150',
        'hover:shadow-sm hover:border-accent-primary-border',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        hasConflict && 'border-destructive/30'
      )}
    >
      {/* Left color bar */}
      <div className="w-[3px] shrink-0" style={{ background: hasConflict ? '#EF4444' : color }} />

      <div className="flex items-start gap-2.5 p-3 flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="flex items-center gap-1.5 mb-1">
            {hasConflict && <AlertTriangle className="size-3 text-destructive shrink-0" />}
            <span className="text-[13px] font-semibold text-foreground leading-tight truncate">
              {event.title}
            </span>
          </div>

          {/* Time + location */}
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3 shrink-0" />
            <span>{timeLabel}</span>
            {event.location && (
              <>
                <span className="mx-0.5 text-border">·</span>
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{event.location}</span>
              </>
            )}
          </div>

          {/* Status row — only renders when props provided */}
          {(chip || eventSource) && (
            <div className="flex items-center gap-1.5 mt-1.5">
              {chip && <StatusChip label={chip.label} variant={chip.variant} />}
              {eventSource && (
                <span className="text-[10px] text-muted-foreground">{eventSource}</span>
              )}
            </div>
          )}
        </div>

        {/* Creator avatar */}
        <div
          className="size-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5"
          style={{ background: color + '28', color }}
        >
          {initials}
        </div>
      </div>
    </div>
  )
}
