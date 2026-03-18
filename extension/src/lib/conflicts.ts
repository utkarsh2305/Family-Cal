import type { CalendarEvent, ConflictPair } from './types'

/** Returns all pairs of timed events that overlap in time. All-day events are excluded. */
export function detectConflicts(events: CalendarEvent[]): ConflictPair[] {
  const pairs: ConflictPair[] = []
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j]
      if (!a.isAllDay && !b.isAllDay &&
          a.startAt < b.endAt && b.startAt < a.endAt) {
        pairs.push({ eventA: a, eventB: b })
      }
    }
  }
  return pairs
}

/** Returns existing events that overlap with a proposed event's time range. */
export function eventsOverlapProposed(
  proposed: { startAt: string; endAt: string; isAllDay: boolean },
  existing: CalendarEvent[]
): CalendarEvent[] {
  if (proposed.isAllDay) return []
  return existing.filter(
    (e) => !e.isAllDay && e.startAt < proposed.endAt && proposed.startAt < e.endAt
  )
}

/** Maps a raw Supabase calendar_events row to a CalendarEvent. */
export function mapRowToCalendarEvent(row: {
  id: string
  title: string
  description?: string | null
  start_at: string
  end_at: string
  location?: string | null
  is_all_day: boolean
  created_by?: string | null
}): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    startAt: row.start_at,
    endAt: row.end_at,
    location: row.location ?? undefined,
    isAllDay: row.is_all_day,
    createdBy: row.created_by ?? undefined,
  }
}
