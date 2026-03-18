/**
 * Chrome MV3 Service Worker — background script.
 *
 * Responsibilities:
 *  - Handle Google OAuth via chrome.identity
 *  - Forward parse-email requests from popup to AI lib
 *  - Persist and refresh Supabase session
 *  - Background God Mode polling (alarm-driven Gmail API scan)
 */

import { supabase } from '../lib/supabase'
import { parseEmailWithAI } from '../lib/ai'
import {
  fetchPollableMessageIds,
  fetchMessageMeta,
  fetchMessageContent,
  fetchContactEmails,
} from '../lib/gmail-api'
import { shouldPollEmail, DEFAULT_CATEGORIES } from '../lib/preferences'
import type { AISettings, ExtensionMessage, PendingInvitation, ProcessedEmail, PollResult } from '../lib/types'

// ── Web Push ───────────────────────────────────────────────────────────────────
// Generate keys once with: npx web-push generate-vapid-keys
// Add VITE_VAPID_PUBLIC_KEY to extension/.env
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string) ?? ''

// Converts a base64url VAPID public key to the Uint8Array that pushManager expects
function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const raw    = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function subscribeToPush(userId: string): Promise<void> {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push] VITE_VAPID_PUBLIC_KEY not set — skipping push subscription')
    return
  }
  try {
    const reg      = self.registration as ServiceWorkerRegistration
    const existing = await reg.pushManager.getSubscription()
    const sub      = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
    await supabase.from('push_subscriptions').upsert({
      user_id:      userId,
      platform:     'chrome',
      token:        sub.endpoint,           // endpoint URL is the unique device key
      subscription: sub.toJSON(),           // full object needed for web-push send
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' })
  } catch (e) {
    console.error('[Push] Subscribe failed:', e)
  }
}

// Incoming push notification (sent by notify-family Cloud Function)
;(self as unknown as ServiceWorkerGlobalScope).addEventListener('push', (event) => {
  const data = event.data?.json() as {
    title: string; body: string; eventId: string; invitationId: string
  } | undefined
  if (!data) return

  event.waitUntil(
    (self.registration as ServiceWorkerRegistration).showNotification(data.title, {
      body:  data.body,
      icon:  'icons/icon48.png',
      badge: 'icons/icon16.png',
      // Collapses duplicate notifications for the same event
      tag:   `invitation-${data.eventId}`,
      data:  { eventId: data.eventId, invitationId: data.invitationId } satisfies PendingInvitation,
    })
  )
})

// Notification tap — stash the invitation data and open the popup
;(self as unknown as ServiceWorkerGlobalScope).addEventListener('notificationclick', (event) => {
  event.notification.close()
  const pending = event.notification.data as PendingInvitation | undefined
  if (!pending?.eventId) return

  event.waitUntil(
    chrome.storage.local
      .set({ pendingInvitation: pending })
      .then(() => {
        try {
          (chrome.action as { openPopup?: () => void }).openPopup?.()
        } catch { /* expected in some Chrome versions */ }
      })
  )
})

// ── Alarms ────────────────────────────────────────────────────────────────────

const KEEP_ALIVE_ALARM = 'keep-alive'
const POLL_ALARM       = 'god-mode-poll'

chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: 0.4 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM) return
  if (alarm.name === POLL_ALARM) { runGodModePoll() }
})

// ── Auth helpers ──────────────────────────────────────────────────────────────


async function getGoogleOAuthToken(interactive: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null)
      } else {
        resolve(token)
      }
    })
  })
}

async function signOut(): Promise<void> {
  await supabase.auth.signOut()
  const token = await getGoogleOAuthToken(false)
  if (token) {
    chrome.identity.removeCachedAuthToken({ token }, () => {})
  }
}

// ── Poll alarm management ─────────────────────────────────────────────────────

async function updatePollAlarm(): Promise<void> {
  await chrome.alarms.clear(POLL_ALARM)
  const stored = await chrome.storage.local.get(['godMode', 'godModeSubtype', 'pollIntervalHours'])
  if (stored.godMode === 'automatic' && stored.godModeSubtype === 'poll') {
    const minutes = ((stored.pollIntervalHours as number) ?? 2) * 60
    chrome.alarms.create(POLL_ALARM, { delayInMinutes: 1, periodInMinutes: minutes })
  }
}

// ── Background God Mode poll ──────────────────────────────────────────────────

async function runGodModePoll(): Promise<void> {
  try {
    // 1. Check user is authenticated
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // 2. Developer kill switch — admin sets polling_enabled = 'false' in app_config
    const { data: config } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'polling_enabled')
      .single()
    if (config?.value !== 'true') return

    // 3. Verify local settings still say poll mode
    const stored = await chrome.storage.local.get([
      'godMode', 'godModeSubtype', 'categories', 'processedEmails', 'pollIntervalHours',
    ])
    if (stored.godMode !== 'automatic' || stored.godModeSubtype !== 'poll') return

    const categories: string[]      = (stored.categories as string[]) ?? DEFAULT_CATEGORIES
    const processedEmails: ProcessedEmail[] = (stored.processedEmails as ProcessedEmail[]) ?? []

    // 4. Gmail OAuth token (non-interactive — must already be signed in)
    const token = await getGoogleOAuthToken(false)
    if (!token) return

    // 5. Build trusted senders from previously accepted emails
    const trustedSenders = new Set<string>(
      processedEmails
        .filter((e) => e.status === 'accepted' || e.status === 'partial')
        .map((e) => e.sender?.toLowerCase())
        .filter((s): s is string => Boolean(s))
    )

    // 6. Fetch Google contacts (cached 24 h; empty if scope not yet granted)
    const contactEmails = await fetchContactEmails(token)

    // 7. Unread message IDs from Primary + Updates (last 48 h)
    const messageIds = await fetchPollableMessageIds(token)
    if (messageIds.length === 0) return

    // 8. Skip already-processed messages
    const processedIds = new Set(processedEmails.map((e) => e.gmailMessageId))

    // 9. Load AI settings from Supabase
    const { data: aiRow } = await supabase
      .from('user_ai_settings')
      .select('*')
      .eq('user_id', session.user.id)
      .single()
    const aiSettings: AISettings = aiRow
      ? { provider: aiRow.provider, apiKey: aiRow.api_key_encrypted, geminiUsesOAuth: aiRow.gemini_uses_oauth }
      : { provider: 'platform' }

    // For Gemini OAuth reuse the Google identity token
    const geminiOAuthToken =
      aiSettings.provider === 'gemini' && aiSettings.geminiUsesOAuth ? token : undefined

    // 10. Filter → fetch body → AI parse (sequential to avoid rate-limit spikes)
    const newResults: PollResult[] = []

    for (const messageId of messageIds) {
      if (processedIds.has(messageId)) continue

      const meta = await fetchMessageMeta(token, messageId)
      if (!meta) continue

      // Safety net: confirm Primary or Updates label
      const isRelevantTab =
        meta.labels.includes('CATEGORY_PERSONAL') ||
        meta.labels.includes('CATEGORY_UPDATES')
      if (!isRelevantTab) continue

      if (!shouldPollEmail(meta.subject, meta.senderEmail, categories, contactEmails, trustedSenders)) continue

      const content = await fetchMessageContent(token, messageId)
      if (!content || !content.body.trim()) continue

      try {
        const events = await parseEmailWithAI(content, aiSettings, session.access_token, geminiOAuthToken)
        if (events.length > 0) {
          newResults.push({ email: content, proposedEvents: events })
        }
      } catch (e) {
        console.error('[Poll] AI parse failed for', messageId, e)
      }
    }

    // 11. Persist results + badge + Chrome notification
    if (newResults.length > 0) {
      const { pendingPolledResults: existing = [] } = await chrome.storage.local.get('pendingPolledResults') as {
        pendingPolledResults?: PollResult[]
      }
      await chrome.storage.local.set({ pendingPolledResults: [...existing, ...newResults] })

      const totalEvents = newResults.reduce((sum, r) => sum + r.proposedEvents.length, 0)
      chrome.action.setBadgeText({ text: String(totalEvents) })
      chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' })

      chrome.notifications.create('god-mode-poll-result', {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Family Calendar — new events found',
        message: `${totalEvents} event${totalEvents !== 1 ? 's' : ''} in ${newResults.length} email${newResults.length !== 1 ? 's' : ''}. Click to review.`,
      })
    }

    await chrome.storage.local.set({ lastPolledAt: new Date().toISOString() })
  } catch (e) {
    console.error('[GodModePoll] Error:', e)
  }
}

// Open popup when the poll notification is clicked
chrome.notifications.onClicked.addListener((id) => {
  if (id === 'god-mode-poll-result') {
    chrome.notifications.clear(id)
    try { (chrome.action as { openPopup?: () => void }).openPopup?.() } catch { /* expected */ }
  }
})

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    ;(async () => {
      switch (message.type) {
        case 'GET_AUTH_TOKEN': {
          const token = await getGoogleOAuthToken(true)
          sendResponse({ token })
          break
        }

        case 'SIGN_OUT': {
          await signOut()
          sendResponse({ ok: true })
          break
        }

        case 'REFRESH_AUTH_TOKEN': {
          const oldToken = await getGoogleOAuthToken(false)
          if (oldToken) {
            await new Promise<void>((r) => chrome.identity.removeCachedAuthToken({ token: oldToken }, r))
          }
          const token = await getGoogleOAuthToken(true)
          sendResponse({ token })
          break
        }

        case 'GET_EMAIL_CONTENT': {
          chrome.action.setBadgeText({ text: '●' })
          chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' })
          try { await (chrome.action as { openPopup?: () => Promise<void> }).openPopup?.() } catch { /* expected */ }
          sendResponse({ ok: true })
          break
        }

        case 'UPDATE_POLL_ALARM': {
          await updatePollAlarm()
          sendResponse({ ok: true })
          break
        }

        case 'POLL_NOW': {
          runGodModePoll()
          sendResponse({ ok: true })
          break
        }

        case 'SUBSCRIBE_PUSH': {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user.id) await subscribeToPush(session.user.id)
          sendResponse({ ok: true })
          break
        }

        case 'FETCH_ATTACHMENTS': {
          const token = await getGoogleOAuthToken(false)
          if (!token) { sendResponse({ attachments: [] }); break }

          try {
            const msgRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${(message as { type: string; messageId: string }).messageId}?format=full`,
              { headers: { Authorization: `Bearer ${token}` } }
            )
            const msg = await msgRes.json()

            const found: Array<{ filename: string; mimeType: string; attachmentId: string }> = []
            function findParts(parts: unknown[]): void {
              if (!Array.isArray(parts)) return
              for (const part of parts as Record<string, unknown>[]) {
                if (part.filename && (part.body as Record<string, unknown>)?.attachmentId) {
                  const mt: string = (part.mimeType as string) ?? ''
                  if (mt.includes('pdf') || mt.includes('msword') || mt.includes('wordprocessingml') || mt.includes('opendocument')) {
                    found.push({
                      filename:     part.filename as string,
                      mimeType:     mt,
                      attachmentId: (part.body as Record<string, unknown>).attachmentId as string,
                    })
                  }
                }
                if (part.parts) findParts(part.parts as unknown[])
              }
            }
            findParts(msg.payload?.parts ?? [])

            const attachments = await Promise.all(
              found.slice(0, 3).map(async (att) => {
                const attRes = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${(message as { type: string; messageId: string }).messageId}/attachments/${att.attachmentId}`,
                  { headers: { Authorization: `Bearer ${token}` } }
                )
                const attData = await attRes.json()
                return { filename: att.filename, mimeType: att.mimeType, data: attData.data as string }
              })
            )

            sendResponse({ attachments })
          } catch (e) {
            console.error('FETCH_ATTACHMENTS error:', e)
            sendResponse({ attachments: [] })
          }
          break
        }

        default:
          sendResponse({ error: 'unknown message type' })
      }
    })()

    return true
  }
)

// ── Install / startup ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({
      aiSettings:       { provider: 'platform' },
      processedEmails:  [],
      godMode:          'manual',
      godModeSubtype:   'open',
      pollIntervalHours: 2,
      categories:       ['school', 'work', 'sports', 'appointments', 'travel'],
    })
    await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') })
  }
  await updatePollAlarm()
})

chrome.runtime.onStartup.addListener(async () => {
  await updatePollAlarm()
})
