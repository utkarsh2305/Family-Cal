import { useEffect } from 'react'
import { supabase, type CalendarEvent } from '../lib/supabase'

type ChangeHandler = (
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  event: CalendarEvent
) => void

/**
 * Subscribes to real-time changes on calendar_events for all given groups.
 * One channel per group. Automatically unsubscribes on unmount or groupIds change.
 */
export function useRealtimeEvents(groupIds: string[], onChange: ChangeHandler): void {
  const key = groupIds.join(',')

  useEffect(() => {
    if (groupIds.length === 0) return

    const channels = groupIds.map((groupId) =>
      supabase
        .channel(`group-events:${groupId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'calendar_events',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            onChange(
              payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
              (payload.new ?? payload.old) as CalendarEvent
            )
          }
        )
        .subscribe()
    )

    return () => { channels.forEach((ch) => supabase.removeChannel(ch)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, onChange])
}
