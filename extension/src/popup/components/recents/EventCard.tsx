import React from 'react'
import { Calendar, MapPin, AlertTriangle, Check, X, RefreshCw } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader } from '../../../components/ui/card'
import type { CalendarEvent, ProposedEvent } from '../../../lib/types'

interface Props {
  event: ProposedEvent
  onAccept: () => void
  onReject: () => void
  familyConflicts?: CalendarEvent[]
}

const CONFIDENCE_VARIANT: Record<ProposedEvent['confidence'], 'success' | 'default' | 'destructive'> = {
  high:   'success',
  medium: 'default',
  low:    'destructive',
}

function formatTimeRange(startAt: string, endAt: string): string {
  const s = new Date(startAt), e = new Date(endAt)
  return `${s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export default function EventCard({ event, onAccept, onReject, familyConflicts }: Props) {
  const start = new Date(event.startAt)
  const end   = new Date(event.endAt)

  const dateStr = event.isAllDay
    ? start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : `${start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`

  return (
    <Card className="mb-3">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <span className="text-[15px] font-semibold text-foreground leading-snug flex-1">
            {event.title}
          </span>
          <Badge variant={CONFIDENCE_VARIANT[event.confidence]} className="shrink-0">
            {event.confidence}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-1.5">
        {/* Date / time */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="size-3.5 shrink-0" />
          <span>{dateStr}</span>
          {event.isRecurring && (
            <Badge variant="secondary" className="gap-1 py-0">
              <RefreshCw className="size-2.5" />
              recurring
            </Badge>
          )}
        </div>

        {/* Location */}
        {event.location && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span>{event.location}</span>
          </div>
        )}

        {/* Description */}
        {event.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {event.description}
          </p>
        )}

        {/* Family schedule conflicts */}
        {familyConflicts && familyConflicts.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-xs text-destructive mt-2">
            <div className="flex items-center gap-1.5 font-semibold mb-1.5">
              <AlertTriangle className="size-3.5" />
              Family schedule conflict
            </div>
            {familyConflicts.map((e) => (
              <div key={e.id} className="flex items-center gap-1.5 mt-1">
                <div className="size-2 rounded-full shrink-0" style={{ background: e.creatorColor ?? 'oklch(0.205 0 0)' }} />
                <span><strong>{e.creatorName ?? 'Family'}</strong>: {e.title} ({formatTimeRange(e.startAt, e.endAt)})</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        {event.alreadyAdded ? (
          <>
            <div className="flex-1 flex items-center justify-center gap-1.5 text-xs text-success font-semibold py-1.5 bg-success/10 rounded-md">
              <Check className="size-3.5" />
              Already in Family Calendar
            </div>
            <Button variant="ghost" size="sm" onClick={onReject}>Dismiss</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onReject}>
              <X className="size-4" />
              Dismiss
            </Button>
            <Button size="sm" onClick={onAccept}>
              <Check className="size-4" />
              Add to Calendar
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
