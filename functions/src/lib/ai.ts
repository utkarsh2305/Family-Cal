/**
 * Server-side AI layer for the parse-email Cloud Function.
 * Uses OpenAI GPT-4o as primary, falls back to Gemini 2.0 Flash.
 */

import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

const SYSTEM_PROMPT = `You are a calendar assistant. Given an email, extract every distinct
calendar event or actionable item with a date or time. Return ONLY valid JSON — no markdown,
no explanation — matching this schema:

{
  "proposedEvents": [
    {
      "title": string,
      "description": string | null,
      "startAt": string,        // ISO 8601, infer current year if missing
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

export interface ProposedEvent {
  title: string
  description?: string | null
  startAt: string
  endAt: string
  location?: string | null
  isAllDay: boolean
  isRecurring: boolean
  recurrenceRule?: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface EmailInput {
  messageId: string
  subject: string
  sender: string
  body: string
  attachmentDescriptions: string[]
  urls?: string[]
  fetchedUrlContent?: string
  attachments?: Array<{ filename: string; mimeType: string; data: string }>
  attachmentTexts?: string[]
}

async function fetchUrlText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const html = await res.text()
      const text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                       .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                       .replace(/<[^>]+>/g, ' ')
                       .replace(/\s+/g, ' ')
                       .trim()
      if (text.length >= 200) return text.slice(0, 3000)
    }
  } catch { /* fall through to Jina */ }

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { signal: AbortSignal.timeout(10000) })
    if (res.ok) return (await res.text()).slice(0, 3000)
  } catch { /* ignore */ }
  return ''
}

export async function fetchUrls(urls: string[]): Promise<string> {
  if (!urls.length) return ''
  const results = await Promise.all(urls.map(u => fetchUrlText(u)))
  const sections = urls
    .map((u, i) => results[i].length > 50 ? `Linked page (${u}):\n${results[i]}` : null)
    .filter(Boolean)
  return sections.join('\n\n---\n\n')
}

function buildUserMessage(email: EmailInput): string {
  return [
    `Subject: ${email.subject}`,
    `From: ${email.sender}`,
    `Body:\n${email.body}`,
    email.attachmentDescriptions.length > 0
      ? `Attachments: ${email.attachmentDescriptions.join(', ')}`
      : null,
    email.fetchedUrlContent
      ? `--- Content from linked pages ---\n${email.fetchedUrlContent}`
      : null,
    email.attachmentTexts?.length
      ? `--- Attachment content ---\n${email.attachmentTexts.join('\n\n---\n\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function parseResponse(raw: string): ProposedEvent[] {
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
  const parsed = JSON.parse(cleaned)
  return parsed.proposedEvents ?? []
}

async function callOpenAI(email: EmailInput): Promise<ProposedEvent[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(email) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  })
  return parseResponse(response.choices[0].message.content ?? '{}')
}

async function callGemini(email: EmailInput): Promise<ProposedEvent[]> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const result = await model.generateContent(SYSTEM_PROMPT + '\n\n' + buildUserMessage(email))
  return parseResponse(result.response.text())
}

export async function extractAttachmentTexts(
  attachments: Array<{ filename: string; mimeType: string; data: string }>
): Promise<string[]> {
  const texts: string[] = []
  for (const att of attachments) {
    try {
      // Gmail API returns base64url — convert to standard base64 buffer
      const buf = Buffer.from(att.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      if (att.mimeType.includes('pdf')) {
        const pdfParse = require('pdf-parse')
        const result = await pdfParse(buf)
        if (result.text?.trim()) texts.push(`[${att.filename}]\n${result.text.trim().slice(0, 4000)}`)
      } else if (att.mimeType.includes('word') || att.mimeType.includes('wordprocessingml') || att.mimeType.includes('opendocument')) {
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ buffer: buf })
        if (result.value?.trim()) texts.push(`[${att.filename}]\n${result.value.trim().slice(0, 4000)}`)
      }
    } catch (e) {
      console.warn(`Failed to extract text from ${att.filename}:`, e)
    }
  }
  return texts
}

export async function parseEmailAI(email: EmailInput): Promise<ProposedEvent[]> {
  try {
    return await callOpenAI(email)
  } catch (err) {
    console.warn('OpenAI failed, falling back to Gemini:', err)
    return callGemini(email)
  }
}
