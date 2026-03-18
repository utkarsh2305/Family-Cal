/**
 * AI routing layer for the extension.
 *
 * Priority order:
 *  1. User's BYOK (Gemini via OAuth, or API key for OpenAI/Claude/Grok)
 *  2. Platform AI — POST to our GCP parse-email Cloud Function (OpenAI GPT-4o,
 *     fallback Gemini 2.0 Flash)
 */

import OpenAI from 'openai'
import { supabase } from './supabase'
import type { AISettings, CalendarEvent, ParsedEmailResult, RawEmailContent } from './types'

export interface ConflictSuggestion {
  label: string
  eventId: 'A' | 'B' | null  // which event to reschedule; null = leave as-is
  shiftMinutes: number | null  // positive = later, negative = earlier
}

const PARSE_EMAIL_FUNCTION_URL = import.meta.env.VITE_PARSE_EMAIL_URL as string

const SYSTEM_PROMPT = `You are a calendar assistant. Given an email, extract every distinct
calendar event or actionable item with a date or time. Return ONLY valid JSON — no markdown,
no explanation — matching this schema:

{
  "proposedEvents": [
    {
      "title": string,
      "description": string | null,
      "startAt": string,        // ISO 8601, infer year if missing
      "endAt": string,          // ISO 8601, use startAt + 1h if unknown
      "location": string | null,
      "isAllDay": boolean,
      "isRecurring": boolean,
      "recurrenceRule": string | null,  // RFC 5545 RRULE if recurring
      "confidence": "high" | "medium" | "low"
    }
  ]
}

If no events are found, return { "proposedEvents": [] }.`


export function buildUserMessage(email: RawEmailContent, learningContext?: string): string {
  return [
    `Subject: ${email.subject}`,
    `From: ${email.sender}`,
    email.receivedAt ? `Email received: ${email.receivedAt}` : null,
    `Body:\n${email.body}`,
    email.attachmentDescriptions.length > 0
      ? `Attachments: ${email.attachmentDescriptions.join(', ')}`
      : null,
    email.fetchedUrlContent
      ? `--- Content from linked pages ---\n${email.fetchedUrlContent}`
      : null,
    learningContext || null,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Builds a short in-context learning summary from the user's recent feedback.
 * Appended to the AI prompt so suggestions improve over time without any ML infra.
 */
export async function buildLearningContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('event_feedback')
      .select('ai_suggestion, user_action, correction')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!data?.length) return ''

    const accepted  = data.filter((r) => r.user_action === 'accept')
      .map((r) => r.ai_suggestion?.title).filter(Boolean).slice(0, 5) as string[]
    const rejected  = data.filter((r) => r.user_action === 'reject')
      .map((r) => r.ai_suggestion?.title).filter(Boolean).slice(0, 5) as string[]
    const corrected = data.filter((r) => r.user_action === 'correct' && r.correction)
      .map((r) => `"${r.ai_suggestion?.title}" → "${r.correction?.title}"`)
      .filter(Boolean).slice(0, 5) as string[]

    const lines: string[] = []
    if (accepted.length)  lines.push(`Previously accepted: ${accepted.join(', ')}`)
    if (rejected.length)  lines.push(`Previously rejected: ${rejected.join(', ')}`)
    if (corrected.length) lines.push(`Previously corrected: ${corrected.join('; ')}`)

    return lines.length
      ? `\n--- User's past feedback (use to improve accuracy) ---\n${lines.join('\n')}\n---`
      : ''
  } catch {
    return ''
  }
}

function parseAIResponse(raw: string): ParsedEmailResult['proposedEvents'] {
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
  const parsed = JSON.parse(cleaned)
  return parsed.proposedEvents ?? []
}

// --- BYOK: OpenAI-compatible providers (OpenAI, Grok) ---
async function callOpenAICompatible(
  email: RawEmailContent,
  apiKey: string,
  learningContext: string,
  baseURL?: string,
  model = 'gpt-4o'
): Promise<ParsedEmailResult['proposedEvents']> {
  const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true })
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(email, learningContext) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  })
  return parseAIResponse(response.choices[0].message.content ?? '{}')
}

// --- BYOK: Gemini via OAuth token ---
async function callGeminiOAuth(
  email: RawEmailContent,
  oauthToken: string,
  learningContext: string
): Promise<ParsedEmailResult['proposedEvents']> {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n' + buildUserMessage(email, learningContext) }] },
        ],
        generationConfig: { temperature: 0.1 },
      }),
    }
  )
  const data = await res.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  return parseAIResponse(text)
}

// --- BYOK: Claude (Anthropic) via API key ---
async function callClaude(
  email: RawEmailContent,
  apiKey: string,
  learningContext: string
): Promise<ParsedEmailResult['proposedEvents']> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(email, learningContext) }],
    }),
  })
  const data = await res.json()
  return parseAIResponse(data.content?.[0]?.text ?? '{}')
}

// --- Platform AI: our GCP Cloud Function ---
// learningContext is embedded in the email body via buildUserMessage on the client side;
// for platform AI we send the enriched email object with learning context appended to body.
async function callPlatformAI(
  email: RawEmailContent,
  supabaseToken: string,
  learningContext: string
): Promise<ParsedEmailResult['proposedEvents']> {
  const enrichedEmail = learningContext
    ? { ...email, body: email.body + learningContext }
    : email
  const res = await fetch(PARSE_EMAIL_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseToken}`,
    },
    body: JSON.stringify(enrichedEmail),
  })
  if (!res.ok) throw new Error(`Platform AI error: ${res.status}`)
  const data: ParsedEmailResult = await res.json()
  return data.proposedEvents
}

// --- Main router ---
export async function parseEmailWithAI(
  email: RawEmailContent,
  settings: AISettings,
  supabaseToken: string,
  geminiOAuthToken?: string,
  learningContext = ''
): Promise<ParsedEmailResult['proposedEvents']> {
  if (settings.provider === 'gemini' && settings.geminiUsesOAuth && geminiOAuthToken) {
    return callGeminiOAuth(email, geminiOAuthToken, learningContext)
  }

  if (settings.provider === 'openai' && settings.apiKey) {
    return callOpenAICompatible(email, settings.apiKey, learningContext)
  }

  if (settings.provider === 'grok' && settings.apiKey) {
    return callOpenAICompatible(email, settings.apiKey, learningContext, 'https://api.x.ai/v1', 'grok-3-mini')
  }

  if (settings.provider === 'claude' && settings.apiKey) {
    return callClaude(email, settings.apiKey, learningContext)
  }

  // Default: platform AI
  return callPlatformAI(email, supabaseToken, learningContext)
}

function buildConflictPrompt(eventA: CalendarEvent, eventB: CalendarEvent): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', weekday: 'short', month: 'short', day: 'numeric' } as Intl.DateTimeFormatOptions)
  return `Two family calendar events overlap:
Event A: "${eventA.title}" — ${fmt(eventA.startAt)} to ${fmt(eventA.endAt)}
Event B: "${eventB.title}" — ${fmt(eventB.startAt)} to ${fmt(eventB.endAt)}

Suggest 3 practical ways to resolve this conflict. For each, specify which event to change and by how many minutes to shift it. Keep labels brief (under 12 words). Return ONLY valid JSON:
{"suggestions": [{"label": "string", "eventId": "A" | "B" | null, "shiftMinutes": number | null}]}`
}

function deterministicConflictSuggestions(
  eventA: CalendarEvent,
  eventB: CalendarEvent
): ConflictSuggestion[] {
  const aEnd   = new Date(eventA.endAt).getTime()
  const bStart = new Date(eventB.startAt).getTime()
  const aStart = new Date(eventA.startAt).getTime()
  const bEnd   = new Date(eventB.endAt).getTime()

  // How much to shift B forward so it starts after A ends
  const shiftBForward  = Math.round((aEnd - bStart) / 60000)
  // How much to shift A backward so it ends before B starts
  const shiftABackward = Math.round((aStart - bEnd) / 60000)

  return [
    {
      label: `Move "${eventB.title}" to after "${eventA.title}" ends`,
      eventId: 'B',
      shiftMinutes: shiftBForward > 0 ? shiftBForward : null,
    },
    {
      label: `Move "${eventA.title}" earlier to end before "${eventB.title}"`,
      eventId: 'A',
      shiftMinutes: shiftABackward < 0 ? shiftABackward : null,
    },
    {
      label: 'Leave as-is (different family members can attend separately)',
      eventId: null,
      shiftMinutes: null,
    },
  ]
}

/** Returns 3 conflict resolution suggestions, using BYOK AI when available. */
export async function getConflictSuggestions(
  eventA: CalendarEvent,
  eventB: CalendarEvent,
  settings: AISettings,
  geminiOAuthToken?: string
): Promise<ConflictSuggestion[]> {
  const prompt = buildConflictPrompt(eventA, eventB)

  try {
    let raw: string | null = null

    if (settings.provider === 'openai' && settings.apiKey) {
      const client = new OpenAI({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true })
      const res = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      })
      raw = res.choices[0].message.content
    } else if (settings.provider === 'grok' && settings.apiKey) {
      const client = new OpenAI({ apiKey: settings.apiKey, baseURL: 'https://api.x.ai/v1', dangerouslyAllowBrowser: true })
      const res = await client.chat.completions.create({
        model: 'grok-2-latest',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      })
      raw = res.choices[0].message.content
    } else if (settings.provider === 'claude' && settings.apiKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await res.json()
      raw = data.content?.[0]?.text ?? null
    } else if (settings.provider === 'gemini' && settings.geminiUsesOAuth && geminiOAuthToken) {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${geminiOAuthToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3 },
          }),
        }
      )
      const data = await res.json()
      raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null
    }

    if (raw) {
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
        return parsed.suggestions as ConflictSuggestion[]
      }
    }
  } catch {
    // fall through to deterministic
  }

  return deterministicConflictSuggestions(eventA, eventB)
}
