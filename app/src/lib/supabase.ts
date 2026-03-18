import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { flowType: 'implicit' },
})

// ── Typed helpers ──────────────────────────────────────────────────────────

export interface CalendarEvent {
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
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface FamilyMember {
  id: string
  group_id: string
  user_id: string
  role: 'owner' | 'editor' | 'viewer'
  joined_at: string
  nickname: string | null
  color: string | null
}

export interface CalendarEventWithCreator extends CalendarEvent {
  creatorName: string | null
  creatorColor: string | null
}

export interface FamilyGroup {
  id: string
  name: string
  created_by: string
}
