import type { ProposedEvent } from './types'

/** Gets a Google access token by asking the service worker (which persists through OAuth redirects). */
export async function getGoogleCalendarToken(): Promise<string | null> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN' })
    return response?.token ?? null
  } catch (e) {
    console.warn('[FamilyCal] GET_AUTH_TOKEN message failed:', e)
    return null
  }
}

/** Clears the cached token and re-requests — use when GCal returns 401/403 (stale/missing scope). */
export async function refreshGoogleCalendarToken(): Promise<string | null> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'REFRESH_AUTH_TOKEN' })
    return response?.token ?? null
  } catch (e) {
    console.warn('[FamilyCal] REFRESH_AUTH_TOKEN message failed:', e)
    return null
  }
}

/**
 * Normalizes an ISO date string for Google Calendar.
 * If the AI returned a date-only string (no 'T'), appends midnight time component.
 * Sending "2026-03-15" as a dateTime field causes a Google Calendar 400 error.
 */
export function normalizeEventDateTime(isoString: string): string {
  return isoString.includes('T') ? isoString : `${isoString}T00:00:00`
}

/** Creates a Google Calendar event via REST. Returns the Google event ID. */
export async function createGoogleCalendarEvent(
  token: string,
  event: ProposedEvent,
): Promise<string> {
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const startIso = normalizeEventDateTime(event.startAt)
  const endIso   = normalizeEventDateTime(event.endAt)
  const body: Record<string, unknown> = {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: event.isAllDay
      ? { date: startIso.split('T')[0] }
      : { dateTime: startIso, timeZone: localTz },
    end: event.isAllDay
      ? { date: endIso.split('T')[0] }
      : { dateTime: endIso, timeZone: localTz },
  }
  if (event.isRecurring && event.recurrenceRule) {
    body.recurrence = [`RRULE:${event.recurrenceRule}`]
  }

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const errText = await res.text()
    console.error('[FamilyCal] Google Calendar API error:', res.status, errText)
    throw new Error(`Google Calendar API ${res.status}: ${errText}`)
  }
  const data = await res.json() as { id: string }
  return data.id
}
