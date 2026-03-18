/**
 * Hash-based idempotency for calendar sync.
 *
 * Adapted from McCroden/family_calendar_sync pattern:
 * https://github.com/McCroden/family_calendar_sync
 *
 * A sync_hash is computed from the event's key fields. If the hash matches
 * what's stored in calendar_event_links, the event has not changed externally
 * and the sync write is skipped. This prevents duplicate writes and ping-pong
 * loops during bidirectional sync.
 */

import { createHash } from 'crypto'

export interface HashableEvent {
  title: string
  startAt: string   // ISO 8601
  endAt: string     // ISO 8601
  location?: string | null
}

/**
 * Returns a 16-character hex hash of the event's key fields.
 * Stable across re-fetches as long as the event hasn't changed.
 */
export function computeSyncHash(event: HashableEvent): string {
  const input = [
    event.title.trim().toLowerCase(),
    event.startAt,
    event.endAt,
    (event.location ?? '').trim().toLowerCase(),
  ].join('|')

  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

/**
 * Returns true if the event has changed since last sync.
 * A missing stored hash is treated as "changed" (first sync).
 */
export function hasEventChanged(current: HashableEvent, storedHash: string | null): boolean {
  if (!storedHash) return true
  return computeSyncHash(current) !== storedHash
}
