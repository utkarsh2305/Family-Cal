import { useCallback, useEffect, useState } from 'react'
import { supabase, type CalendarEvent } from '../lib/supabase'

export function useCalendarEvents(groupIds: string[]) {
  const [events, setEvents]   = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const key = groupIds.join(',')

  const fetchEvents = useCallback(async () => {
    if (groupIds.length === 0) { setLoading(false); return }
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('calendar_events')
      .select('*')
      .in('group_id', groupIds)
      .order('start_at', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setEvents(data ?? [])
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  return { events, loading, error, refetch: fetchEvents }
}
