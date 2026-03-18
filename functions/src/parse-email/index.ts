/**
 * GCP Cloud Function: parse-email
 *
 * Receives raw email content from the Chrome extension (platform AI path),
 * runs AI parsing, and returns proposed calendar events.
 *
 * POST /parse-email
 * Authorization: Bearer <supabase_access_token>
 * Body: EmailInput
 */

import type { HttpFunction } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'
import { parseEmailAI, extractAttachmentTexts, fetchUrls, type EmailInput } from '../lib/ai'

const SUPABASE_URL  = process.env.SUPABASE_URL!
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY!

export const handler: HttpFunction = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).send(''); return }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return }

  // Verify the caller is an authenticated Supabase user
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) { res.status(401).json({ error: 'Missing authorization token' }); return }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) { res.status(401).json({ error: 'Invalid token' }); return }

  const email: EmailInput = req.body
  if (!email?.body && !email?.subject) {
    res.status(400).json({ error: 'Missing email content' })
    return
  }

  try {
    // Fetch linked page content server-side if URLs provided
    if (email.urls?.length) {
      email.fetchedUrlContent = await fetchUrls(email.urls)
    }

    // Extract text from PDF/Word attachments if provided
    if (email.attachments?.length) {
      email.attachmentTexts = await extractAttachmentTexts(email.attachments)
    }

    const proposedEvents = await parseEmailAI(email)
    res.status(200).json({
      gmailMessageId: email.messageId,
      subject: email.subject,
      sender: email.sender,
      proposedEvents,
    })
  } catch (err) {
    console.error('parse-email error:', err)
    res.status(500).json({ error: 'AI parsing failed' })
  }
}
