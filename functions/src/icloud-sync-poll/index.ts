/**
 * GCP Cloud Function: icloud-sync-poll
 *
 * Triggered by Cloud Scheduler every 10 minutes.
 * Polls iCloud CalDAV for changes and syncs them to Supabase.
 *
 * iCloud does not support webhooks — polling is the only option.
 *
 * CalDAV parsing reference:
 *   https://github.com/pixxelfriend/MMM-FamilyWeekCalendar (ical.js patterns)
 *   https://github.com/McCroden/family_calendar_sync (hash-based idempotency)
 *
 * POST /icloud-sync-poll (called by Cloud Scheduler with OIDC token)
 */

import type { HttpFunction } from '@google-cloud/functions-framework'
import { supabase } from '../lib/supabase'
import { fetchCalDavEvents } from '../lib/caldav'
import { computeSyncHash, hasEventChanged } from '../lib/sync-hash'

// Poll window: events starting within this range
const WINDOW_DAYS_PAST   = 7
const WINDOW_DAYS_FUTURE = 90

export const handler: HttpFunction = async (_req, res) => {
  // Fetch all users with iCloud connections
  const { data: connections, error: connError } = await supabase
    .from('user_calendar_connections')
    .select('user_id, calendar_id, access_token, refresh_token')
    .eq('provider', 'icloud')
    .eq('sync_enabled', true)

  if (connError) {
    console.error('icloud-sync-poll: failed to fetch connections', connError)
    res.status(500).json({ error: connError.message })
    return
  }

  const windowStart = new Date(Date.now() - WINDOW_DAYS_PAST   * 86400_000)
  const windowEnd   = new Date(Date.now() + WINDOW_DAYS_FUTURE * 86400_000)

  let synced = 0
  let errors = 0

  for (const conn of connections ?? []) {
    try {
      // access_token = Apple ID (email), refresh_token = app-specific password
      const username = conn.access_token!
      const password = conn.refresh_token!

      const remoteEvents = await fetchCalDavEvents(
        username, password, conn.calendar_id, windowStart, windowEnd
      )

      for (const remote of remoteEvents) {
        // Check if we have a linked Supabase event for this UID
        const { data: link } = await supabase
          .from('calendar_event_links')
          .select('id, event_id, sync_hash')
          .eq('provider', 'icloud')
          .eq('external_event_id', remote.uid)
          .single()

        const currentHash = computeSyncHash({
          title: remote.title,
          startAt: remote.startAt,
          endAt: remote.endAt,
          location: remote.location,
        })

        if (link) {
          // Event exists — check if changed
          if (!hasEventChanged({ title: remote.title, startAt: remote.startAt, endAt: remote.endAt, location: remote.location }, link.sync_hash)) {
            continue // No change — skip
          }

          // Update Supabase
          await supabase.from('calendar_events').update({
            title:       remote.title,
            description: remote.description,
            start_at:    remote.startAt,
            end_at:      remote.endAt,
            location:    remote.location,
            is_all_day:  remote.isAllDay,
            is_recurring: remote.isRecurring,
            recurrence_rule: remote.recurrenceRule,
            updated_at:  new Date().toISOString(),
          }).eq('id', link.event_id)

          await supabase.from('calendar_event_links').update({
            sync_hash:      currentHash,
            last_synced_at: new Date().toISOString(),
          }).eq('id', link.id)

          synced++
        }
        // Note: We don't auto-create Supabase events for iCloud events that
        // weren't initiated through our app — user must add via extension.
        // This prevents flooding the family calendar with all existing iCloud events.
      }

      // Detect deletions: events linked to iCloud that no longer appear in poll
      const remoteUids = new Set(remoteEvents.map((e) => e.uid))

      const { data: allLinks } = await supabase
        .from('calendar_event_links')
        .select('id, event_id, external_event_id')
        .eq('provider', 'icloud')

      for (const link of allLinks ?? []) {
        if (!remoteUids.has(link.external_event_id)) {
          // Check if this event is within the poll window (avoid deleting future events not yet fetched)
          const { data: ev } = await supabase
            .from('calendar_events')
            .select('start_at')
            .eq('id', link.event_id)
            .single()

          if (!ev) continue
          const start = new Date(ev.start_at)
          if (start >= windowStart && start <= windowEnd) {
            // Event was in window but is gone from iCloud — delete from family cal
            await supabase.from('calendar_events').delete().eq('id', link.event_id)
            await supabase.from('calendar_event_links').delete().eq('id', link.id)
          }
        }
      }
    } catch (err) {
      console.error(`icloud-sync-poll: error for user ${conn.user_id}:`, err)
      errors++
    }
  }

  res.status(200).json({ synced, errors })
}
