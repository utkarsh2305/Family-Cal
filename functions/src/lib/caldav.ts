/**
 * iCloud CalDAV client using the tsdav library.
 *
 * iCloud CalDAV notes:
 *  - Server URL: https://caldav.icloud.com
 *  - Auth: HTTP Basic (Apple ID + app-specific password)
 *  - No webhooks — polling only (this function is called by Cloud Scheduler)
 *  - Returns iCal-format (RFC 5545) VCALENDAR/VEVENT data
 *
 * ical.js parsing reference:
 *   https://github.com/pixxelfriend/MMM-FamilyWeekCalendar
 *   See: MMM-FamilyWeekCalendar.js — ical.js parsing and recurrence handling
 */

import { createDAVClient, type DAVCalendarObject } from 'tsdav'
import type { DBCalendarEvent } from './supabase'
import { computeSyncHash } from './sync-hash'

const ICLOUD_DAV_URL = 'https://caldav.icloud.com'

export async function buildCalDavClient(username: string, appSpecificPassword: string) {
  return createDAVClient({
    serverUrl: ICLOUD_DAV_URL,
    credentials: { username, password: appSpecificPassword },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
}

export interface CalDavEvent {
  uid: string
  title: string
  startAt: string
  endAt: string
  location: string | null
  description: string | null
  isAllDay: boolean
  isRecurring: boolean
  recurrenceRule: string | null
  rawIcal: string
  syncHash: string
}

/**
 * Fetches all events from an iCloud calendar within a time window.
 * Uses tsdav to handle CalDAV protocol; parses iCal with basic regex.
 * For complex recurrence parsing, reference MMM-FamilyWeekCalendar.js.
 */
export async function fetchCalDavEvents(
  username: string,
  appSpecificPassword: string,
  calendarUrl: string,
  windowStart: Date,
  windowEnd: Date
): Promise<CalDavEvent[]> {
  const client = await buildCalDavClient(username, appSpecificPassword)

  const objects = await client.fetchCalendarObjects({
    calendar: { url: calendarUrl },
    timeRange: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
    },
  })

  return objects.map(parseCalDavObject).filter((e): e is CalDavEvent => e !== null)
}

function parseCalDavObject(obj: DAVCalendarObject): CalDavEvent | null {
  const ical = obj.data ?? ''

  const uid          = extract(ical, 'UID') ?? obj.url
  const title        = extract(ical, 'SUMMARY') ?? '(no title)'
  const rawStart     = extract(ical, 'DTSTART') ?? ''
  const rawEnd       = extract(ical, 'DTEND') ?? extract(ical, 'DURATION') ?? rawStart
  const location     = extract(ical, 'LOCATION') ?? null
  const description  = extract(ical, 'DESCRIPTION') ?? null
  const rrule        = extract(ical, 'RRULE') ?? null
  const isAllDay     = rawStart.length === 8 && !rawStart.includes('T')

  const startAt = parseIcalDate(rawStart)
  const endAt   = parseIcalDate(rawEnd)

  if (!startAt || !endAt || !uid) return null

  const event = { title, startAt, endAt, location }

  return {
    uid,
    title,
    startAt,
    endAt,
    location,
    description,
    isAllDay,
    isRecurring: rrule !== null,
    recurrenceRule: rrule,
    rawIcal: ical,
    syncHash: computeSyncHash(event),
  }
}

function extract(ical: string, property: string): string | null {
  // Matches both simple "PROP:value" and parameterized "PROP;TZID=...:value"
  const match = ical.match(new RegExp(`^${property}(?:;[^:]*)?:(.+)$`, 'm'))
  return match ? match[1].trim().replace(/\\n/g, '\n').replace(/\\,/g, ',') : null
}

function parseIcalDate(raw: string): string | null {
  if (!raw) return null
  // All-day: YYYYMMDD → YYYY-MM-DDT00:00:00Z
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00Z`
  }
  // DateTime: YYYYMMDDTHHmmssZ or YYYYMMDDTHHmmss
  if (/^\d{8}T\d{6}Z?$/.test(raw)) {
    const d = raw.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/, '$1-$2-$3T$4:$5:$6Z')
    return d
  }
  return null
}

/**
 * Creates an event on an iCloud CalDAV calendar.
 * Returns the UID used for the new event.
 */
export async function createCalDavEvent(
  username: string,
  appSpecificPassword: string,
  calendarUrl: string,
  event: DBCalendarEvent
): Promise<string> {
  const client = await buildCalDavClient(username, appSpecificPassword)
  const uid = crypto.randomUUID()

  const dtFormat = (iso: string, allDay: boolean) =>
    allDay
      ? iso.split('T')[0].replace(/-/g, '')
      : iso.replace(/[-:]/g, '').replace('.000Z', 'Z')

  let ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FamilyCalendar//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SUMMARY:${event.title}`,
    `DTSTART${event.is_all_day ? ';VALUE=DATE' : ''}:${dtFormat(event.start_at, event.is_all_day)}`,
    `DTEND${event.is_all_day ? ';VALUE=DATE' : ''}:${dtFormat(event.end_at, event.is_all_day)}`,
    event.location    ? `LOCATION:${event.location}` : null,
    event.description ? `DESCRIPTION:${event.description}` : null,
    event.is_recurring && event.recurrence_rule ? `RRULE:${event.recurrence_rule}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  await client.createCalendarObject({
    calendar: { url: calendarUrl },
    filename: `${uid}.ics`,
    iCalString: ical,
  })

  return uid
}

/**
 * Deletes an event from an iCloud CalDAV calendar by its UID/URL.
 */
export async function deleteCalDavEvent(
  username: string,
  appSpecificPassword: string,
  eventUrl: string
): Promise<void> {
  const client = await buildCalDavClient(username, appSpecificPassword)
  await client.deleteCalendarObject({ calendarObject: { url: eventUrl, etag: '' } })
}
