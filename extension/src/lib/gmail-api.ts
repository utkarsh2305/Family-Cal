/**
 * Gmail API + People API helpers — service worker side only.
 * All functions use fetch (no DOM), safe in MV3 background context.
 */

import type { RawEmailContent } from './types'

const GMAIL_API  = 'https://gmail.googleapis.com/gmail/v1/users/me'
const PEOPLE_API = 'https://people.googleapis.com/v1/people/me/connections'
const CONTACTS_TTL_MS = 24 * 60 * 60 * 1000  // cache contacts for 24 h

// ── Message list ──────────────────────────────────────────────────────────────

/**
 * Returns up to `maxResults` unread message IDs from Gmail's Primary and
 * Updates tabs, received within the last 48 hours.
 */
export async function fetchPollableMessageIds(
  token: string,
  maxResults = 50
): Promise<string[]> {
  const q = encodeURIComponent(
    'is:unread (category:primary OR category:updates) newer_than:2d'
  )
  const url = `${GMAIL_API}/messages?q=${q}&maxResults=${maxResults}&fields=messages(id)`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.messages ?? []).map((m: { id: string }) => m.id)
  } catch {
    return []
  }
}

// ── Message metadata (lightweight — headers + labels only) ────────────────────

export interface MessageMeta {
  subject: string
  senderEmail: string   // lower-cased email address only (no display name)
  senderRaw: string     // original From header value
  labels: string[]      // e.g. ['INBOX', 'CATEGORY_PERSONAL', 'UNREAD']
  dateIso?: string
}

/**
 * Fetches just headers + label IDs for a message.
 * Much cheaper than fetching the full body — used for pre-filtering.
 */
export async function fetchMessageMeta(
  token: string,
  messageId: string
): Promise<MessageMeta | null> {
  const fields = 'labelIds,payload(headers)'
  const headers = 'metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date'
  const url = `${GMAIL_API}/messages/${messageId}?format=metadata&${headers}&fields=${fields}`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const data = await res.json()

    const hdrs: Array<{ name: string; value: string }> = data.payload?.headers ?? []
    const subject   = hdrs.find((h) => h.name === 'Subject')?.value ?? '(no subject)'
    const fromRaw   = hdrs.find((h) => h.name === 'From')?.value ?? ''
    const dateRaw   = hdrs.find((h) => h.name === 'Date')?.value

    // Extract email address from "Display Name <email@domain>" or bare "email@domain"
    const emailMatch = fromRaw.match(/<([^>]+)>/) ?? fromRaw.match(/([^\s<>]+@[^\s<>]+)/)
    const senderEmail = (emailMatch?.[1] ?? fromRaw).toLowerCase().trim()

    let dateIso: string | undefined
    if (dateRaw) {
      try { dateIso = new Date(dateRaw).toISOString() } catch { /* ignore */ }
    }

    return {
      subject,
      senderEmail,
      senderRaw: fromRaw,
      labels: data.labelIds ?? [],
      dateIso,
    }
  } catch {
    return null
  }
}

// ── Full message body ─────────────────────────────────────────────────────────

/**
 * Fetches the complete email and returns it as a RawEmailContent suitable
 * for `parseEmailWithAI`. Only called after the email passes all filters.
 */
export async function fetchMessageContent(
  token: string,
  messageId: string
): Promise<RawEmailContent | null> {
  const url = `${GMAIL_API}/messages/${messageId}?format=full`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const data = await res.json()

    const hdrs: Array<{ name: string; value: string }> = data.payload?.headers ?? []
    const subject  = hdrs.find((h) => h.name === 'Subject')?.value ?? '(no subject)'
    const fromRaw  = hdrs.find((h) => h.name === 'From')?.value ?? ''
    const dateRaw  = hdrs.find((h) => h.name === 'Date')?.value

    const emailMatch = fromRaw.match(/<([^>]+)>/) ?? fromRaw.match(/([^\s<>]+@[^\s<>]+)/)
    const sender = (emailMatch?.[1] ?? fromRaw).trim()

    let receivedAt: string | undefined
    if (dateRaw) {
      try { receivedAt = new Date(dateRaw).toISOString() } catch { /* ignore */ }
    }

    const body = extractTextFromPayload(data.payload)

    // Extract URLs from body (same logic as content script)
    const SKIP_URL_RE = /unsubscr|track[^s]|click\.|pixel\.|open\.|beacon|mailto:|tel:|#/i
    const rawUrls = body.match(/https?:\/\/[^\s<>"'{}|\\^`[\]]+/g) ?? []
    const urls = [...new Set(
      rawUrls
        .map((u) => u.replace(/[.,;:!?)]+$/, ''))
        .filter((u) => !SKIP_URL_RE.test(u))
    )].slice(0, 5)

    return { messageId, subject, sender, body, attachmentDescriptions: [], receivedAt, urls }
  } catch {
    return null
  }
}

/** Recursively extract plain text from a Gmail message payload. */
function extractTextFromPayload(payload: Record<string, unknown>): string {
  if (!payload) return ''

  // Leaf node with encoded data
  if (typeof (payload.body as Record<string, unknown>)?.data === 'string') {
    try {
      const b64 = ((payload.body as Record<string, unknown>).data as string)
        .replace(/-/g, '+').replace(/_/g, '/')
      return atob(b64)
    } catch { return '' }
  }

  // Multipart node — prefer text/plain, fall back to text/html, then recurse
  const parts = payload.parts as Record<string, unknown>[] | undefined
  if (Array.isArray(parts)) {
    const textPart = parts.find((p) => p.mimeType === 'text/plain')
    if (textPart) {
      const t = extractTextFromPayload(textPart)
      if (t) return t
    }
    for (const p of parts) {
      const t = extractTextFromPayload(p)
      if (t) return t
    }
  }

  return ''
}

// ── Google Contacts (People API) ──────────────────────────────────────────────

/**
 * Returns a Set of lower-cased email addresses from the user's Google contacts.
 * Results are cached in chrome.storage.local for 24 hours to avoid redundant
 * API calls on every poll.
 *
 * If the contacts.readonly scope hasn't been granted yet (new users or first
 * grant of the new scope), returns an empty Set gracefully.
 */
export async function fetchContactEmails(token: string): Promise<Set<string>> {
  // Check cache
  const { contactsCache } = await chrome.storage.local.get('contactsCache') as {
    contactsCache?: { emails: string[]; fetchedAt: number }
  }
  if (contactsCache && Date.now() - contactsCache.fetchedAt < CONTACTS_TTL_MS) {
    return new Set(contactsCache.emails)
  }

  try {
    const url = `${PEOPLE_API}?personFields=emailAddresses&pageSize=1000`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return new Set()

    const data = await res.json()
    const emails: string[] = []
    for (const person of data.connections ?? []) {
      for (const e of (person.emailAddresses ?? []) as Array<{ value?: string }>) {
        if (e.value) emails.push(e.value.toLowerCase())
      }
    }

    await chrome.storage.local.set({ contactsCache: { emails, fetchedAt: Date.now() } })
    return new Set(emails)
  } catch {
    return new Set()
  }
}
