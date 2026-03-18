import { google } from 'googleapis'
import type { DBCalendarEvent } from './supabase'

export function buildGoogleAuthClient(accessToken: string, refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!
  )
  oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken })
  return oauth2Client
}

export function buildCalendarClient(auth: ReturnType<typeof buildGoogleAuthClient>) {
  return google.calendar({ version: 'v3', auth })
}

export async function createGoogleEvent(
  auth: ReturnType<typeof buildGoogleAuthClient>,
  calendarId: string,
  event: DBCalendarEvent
): Promise<string> {
  const cal = buildCalendarClient(auth)
  const body: any = {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start: event.is_all_day
      ? { date: event.start_at.split('T')[0] }
      : { dateTime: event.start_at },
    end: event.is_all_day
      ? { date: event.end_at.split('T')[0] }
      : { dateTime: event.end_at },
  }
  if (event.is_recurring && event.recurrence_rule) {
    body.recurrence = [`RRULE:${event.recurrence_rule}`]
  }
  const res = await cal.events.insert({ calendarId, requestBody: body })
  return res.data.id!
}

export async function updateGoogleEvent(
  auth: ReturnType<typeof buildGoogleAuthClient>,
  calendarId: string,
  externalEventId: string,
  event: DBCalendarEvent
): Promise<void> {
  const cal = buildCalendarClient(auth)
  const body: any = {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start: event.is_all_day
      ? { date: event.start_at.split('T')[0] }
      : { dateTime: event.start_at },
    end: event.is_all_day
      ? { date: event.end_at.split('T')[0] }
      : { dateTime: event.end_at },
  }
  await cal.events.update({ calendarId, eventId: externalEventId, requestBody: body })
}

export async function deleteGoogleEvent(
  auth: ReturnType<typeof buildGoogleAuthClient>,
  calendarId: string,
  externalEventId: string
): Promise<void> {
  const cal = buildCalendarClient(auth)
  await cal.events.delete({ calendarId, eventId: externalEventId })
}

/**
 * Registers a Google Calendar push notification channel.
 * Google will POST to our calendar-webhook Cloud Function URL on every change.
 * Channels expire after at most 7 days and must be renewed.
 */
export async function registerGoogleWebhook(
  auth: ReturnType<typeof buildGoogleAuthClient>,
  calendarId: string,
  webhookUrl: string,
  channelId: string
): Promise<{ expiration: string }> {
  const cal = buildCalendarClient(auth)
  const res = await cal.events.watch({
    calendarId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
    },
  })
  return { expiration: res.data.expiration ?? '' }
}
