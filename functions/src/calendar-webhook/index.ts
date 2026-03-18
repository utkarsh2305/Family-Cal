/**
 * GCP Cloud Function: calendar-webhook
 *
 * Receives Google Calendar push notifications.
 * When Google Calendar changes, Google POSTs a notification here.
 * We then fetch the changed event and update Supabase.
 *
 * Google sends minimal info (channel ID, resource ID) — we must fetch
 * the actual event from Google Calendar API.
 *
 * POST /calendar-webhook
 * Headers: X-Goog-Channel-ID, X-Goog-Resource-ID, X-Goog-Resource-State
 */

import type { HttpFunction } from '@google-cloud/functions-framework'
import { google } from 'googleapis'
import { supabase } from '../lib/supabase'
import { computeSyncHash, hasEventChanged } from '../lib/sync-hash'
import { buildGoogleAuthClient } from '../lib/google-calendar'

// Debounce window in ms — prevents ping-pong when we push to Google
// and their webhook fires back at us
const DEBOUNCE_MS = 30_000

export const handler: HttpFunction = async (req, res) => {
  // Google sends OPTIONS preflight
  if (req.method !== 'POST') { res.status(204).send(''); return }

  const channelId   = req.headers['x-goog-channel-id'] as string
  const state       = req.headers['x-goog-resource-state'] as string // 'sync' | 'exists' | 'not_exists'

  // 'sync' is just a channel verification ping — acknowledge and ignore
  if (state === 'sync') { res.status(200).send('ok'); return }
  if (!channelId)       { res.status(400).send('missing channel id'); return }

  // Look up the connection by channel ID (stored when webhook was registered)
  const { data: connection, error: connError } = await supabase
    .from('user_calendar_connections')
    .select('user_id, calendar_id, access_token, refresh_token')
    .eq('provider', 'google')
    // channel_id stored as metadata — for MVP store in calendar_id field with prefix
    .ilike('calendar_id', `%${channelId.split(':')[0]}%`)
    .single()

  if (connError || !connection) {
    console.warn('calendar-webhook: no connection for channel', channelId)
    res.status(200).send('ok') // Always 200 to Google or it will retry
    return
  }

  const auth = buildGoogleAuthClient(
    connection.access_token!,
    connection.refresh_token!
  )
  const cal = google.calendar({ version: 'v3', auth })

  // Fetch recently modified events (last 60 seconds window)
  const timeMin = new Date(Date.now() - 60_000).toISOString()
  const { data: { items = [] } } = await cal.events.list({
    calendarId: connection.calendar_id,
    updatedMin: timeMin,
    singleEvents: true,
    maxResults: 50,
  })

  for (const googleEvent of items) {
    if (!googleEvent.id) continue

    // Check if this event is linked to our family calendar
    const { data: link } = await supabase
      .from('calendar_event_links')
      .select('id, event_id, sync_hash, last_synced_at')
      .eq('provider', 'google')
      .eq('external_event_id', googleEvent.id)
      .single()

    if (!link) continue // We didn't create this event — ignore

    // Debounce: skip if we synced this event very recently (we probably triggered it)
    if (link.last_synced_at) {
      const msSinceSync = Date.now() - new Date(link.last_synced_at).getTime()
      if (msSinceSync < DEBOUNCE_MS) continue
    }

    const startAt = googleEvent.start?.dateTime ?? googleEvent.start?.date ?? ''
    const endAt   = googleEvent.end?.dateTime   ?? googleEvent.end?.date   ?? ''

    const currentEvent = {
      title: googleEvent.summary ?? '',
      startAt,
      endAt,
      location: googleEvent.location ?? null,
    }

    // Skip if nothing changed
    if (!hasEventChanged(currentEvent, link.sync_hash)) continue

    // Handle deletion
    if (googleEvent.status === 'cancelled') {
      await supabase.from('calendar_events').delete().eq('id', link.event_id)
      await supabase.from('calendar_event_links').delete().eq('id', link.id)
      continue
    }

    // Update Supabase event
    const newHash = computeSyncHash(currentEvent)
    await supabase.from('calendar_events').update({
      title:       googleEvent.summary ?? '',
      description: googleEvent.description ?? null,
      start_at:    startAt,
      end_at:      endAt,
      location:    googleEvent.location ?? null,
      updated_at:  new Date().toISOString(),
    }).eq('id', link.event_id)

    // Update sync metadata
    await supabase.from('calendar_event_links').update({
      sync_hash:      newHash,
      last_synced_at: new Date().toISOString(),
    }).eq('id', link.id)
  }

  res.status(200).send('ok')
}
