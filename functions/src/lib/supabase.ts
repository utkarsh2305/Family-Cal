import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL         = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!

// Service role client — bypasses RLS for server-side sync operations.
// Never expose this key to clients.
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

export interface DBCalendarEvent {
  id: string
  group_id: string
  title: string
  description: string | null
  start_at: string
  end_at: string
  location: string | null
  is_all_day: boolean
  is_recurring: boolean
  recurrence_rule: string | null
}

export interface DBEventLink {
  id: string
  event_id: string
  provider: 'google' | 'icloud'
  external_event_id: string
  external_calendar_id: string
  last_synced_at: string | null
  sync_hash: string | null
}

export interface DBUserCalendarConnection {
  user_id: string
  provider: 'google' | 'icloud'
  access_token: string | null
  refresh_token: string | null
  calendar_id: string
  sync_enabled: boolean
}
