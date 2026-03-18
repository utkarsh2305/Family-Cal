/**
 * GCP Cloud Function: notify-family
 *
 * Explicit HTTP POST — NOT triggered by a DB webhook.
 * Called by the extension after a user accepts an event and chooses to notify
 * specific family members.
 *
 * POST /notifyFamily
 * Body (JSON):
 *   {
 *     eventId:        string        — Supabase calendar_events.id
 *     fromUserId:     string        — user sending the invitation
 *     targetUserIds:  string[]      — users to notify
 *   }
 *
 * The function:
 *   1. Fetches the event + from-user info from Supabase
 *   2. Writes event_invitations rows (one per target user)
 *   3. Looks up push_subscriptions for each target user
 *   4. Sends Web Push (platform = 'chrome') via VAPID + web-push library
 *   5. Sends FCM (platform = 'android' | 'ios') via Firebase Admin
 *   6. Updates last_used_at on successful sends; removes invalid tokens
 */

import type { HttpFunction } from '@google-cloud/functions-framework'
import * as admin from 'firebase-admin'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const SUPABASE_URL  = process.env.SUPABASE_URL!
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY!

// ── Firebase Admin (lazy init) ────────────────────────────────────────────────

function getMessaging(): admin.messaging.Messaging {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)
      ),
    })
  }
  return admin.messaging()
}

// ── VAPID (Web Push) setup ────────────────────────────────────────────────────

function configureWebPush(): void {
  const pub     = process.env.VAPID_PUBLIC_KEY
  const priv    = process.env.VAPID_PRIVATE_KEY
  const contact = process.env.VAPID_CONTACT ?? 'mailto:admin@familycal.app'

  if (!pub || !priv) {
    throw new Error('[notify-family] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars not set')
  }
  webpush.setVapidDetails(contact, pub, priv)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequestBody {
  eventId:       string
  fromUserId:    string
  targetUserIds: string[]
}

interface PushSubscriptionRow {
  id:           string
  user_id:      string
  platform:     'chrome' | 'android' | 'ios'
  token:        string
  subscription: webpush.PushSubscription | null
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler: HttpFunction = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).send(''); return }
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return }

  // Verify Supabase JWT — caller must be an authenticated user
  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  if (!token) { res.status(401).json({ error: 'Missing authorization token' }); return }

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON)
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) { res.status(401).json({ error: 'Invalid token' }); return }

  const body = req.body as Partial<RequestBody>
  const { eventId, fromUserId, targetUserIds } = body

  if (!eventId || !fromUserId || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
    res.status(400).json({ error: 'eventId, fromUserId, and targetUserIds[] are required' })
    return
  }

  // fromUserId must match the authenticated user
  if (fromUserId !== user.id) {
    res.status(403).json({ error: 'fromUserId must match authenticated user' })
    return
  }

  // ── 1. Fetch event details ─────────────────────────────────────────────────

  const { data: event, error: eventErr } = await supabase
    .from('calendar_events')
    .select('id, title, description, start_at, end_at, location, is_all_day, group_id')
    .eq('id', eventId)
    .single()

  if (eventErr || !event) {
    res.status(404).json({ error: 'Event not found' })
    return
  }

  // ── 2. Fetch sender display name ───────────────────────────────────────────

  const { data: senderMember } = await supabase
    .from('family_members')
    .select('nickname, user_profiles(email)')
    .eq('group_id', event.group_id)
    .eq('user_id', fromUserId)
    .single()

  const senderName: string =
    (senderMember as any)?.nickname ??
    ((senderMember as any)?.user_profiles?.email as string | undefined)?.split('@')[0] ??
    'A family member'

  // ── 3. Write event_invitations rows ───────────────────────────────────────
  // upsert — safe to call multiple times (e.g. resend)

  const invitationRows = targetUserIds.map((toUserId) => ({
    event_id:     eventId,
    from_user_id: fromUserId,
    to_user_id:   toUserId,
  }))

  const { data: insertedInvitations } = await supabase
    .from('event_invitations')
    .upsert(invitationRows, { onConflict: 'event_id,to_user_id', ignoreDuplicates: false })
    .select('id, to_user_id')

  // Build a map: to_user_id → invitation_id for the notification payload
  const invitationIdMap = new Map<string, string>(
    (insertedInvitations ?? []).map((inv: { id: string; to_user_id: string }) => [inv.to_user_id, inv.id])
  )

  // ── 4. Fetch push subscriptions for target users ───────────────────────────

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, platform, token, subscription')
    .in('user_id', targetUserIds)

  if (!subscriptions?.length) {
    res.status(200).json({ sent: 0, failed: 0, message: 'No push subscriptions found' })
    return
  }

  // ── 5. Build notification payload ─────────────────────────────────────────

  const notifTitle = `${senderName} invited you to an event`
  const notifBody  = event.title +
    (event.start_at ? ` · ${new Date(event.start_at).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })}` : '')

  // ── 6. Send notifications ──────────────────────────────────────────────────

  configureWebPush()

  let successCount = 0
  let failureCount = 0
  const invalidTokenIds: string[] = []
  const successfulTokenIds: string[] = []

  const rows = subscriptions as PushSubscriptionRow[]

  await Promise.all(
    rows.map(async (sub) => {
      const invitationId = invitationIdMap.get(sub.user_id) ?? ''

      const dataPayload = {
        title:        notifTitle,
        body:         notifBody,
        eventId,
        invitationId,
        // Full event details so recipient can render the card without a DB round-trip
        eventTitle:   event.title,
        eventStart:   event.start_at ?? '',
        eventEnd:     event.end_at ?? '',
        eventLocation: event.location ?? '',
        isAllDay:     String(event.is_all_day),
      }

      try {
        if (sub.platform === 'chrome') {
          // ── Web Push ────────────────────────────────────────────────────────
          if (!sub.subscription) {
            console.warn('[notify-family] Chrome sub missing subscription JSON, skipping', sub.id)
            failureCount++
            return
          }
          await webpush.sendNotification(
            sub.subscription,
            JSON.stringify(dataPayload),
            { TTL: 86400 } // deliver within 24 h
          )
        } else {
          // ── FCM (Android / iOS) ─────────────────────────────────────────────
          await getMessaging().send({
            token: sub.token,
            notification: { title: notifTitle, body: notifBody },
            data: dataPayload,
            apns: {
              payload: { aps: { sound: 'default', badge: 1 } },
            },
            android: {
              priority: 'high',
              notification: { sound: 'default' },
            },
          })
        }
        successCount++
        successfulTokenIds.push(sub.id)
      } catch (err: any) {
        failureCount++
        // 410 Gone = Chrome unsubscribed; FCM registration-not-found / not-registered = stale
        const isGone =
          err?.statusCode === 410 ||
          err?.errorInfo?.code === 'messaging/registration-token-not-registered' ||
          err?.errorInfo?.code === 'messaging/invalid-registration-token'

        if (isGone) {
          invalidTokenIds.push(sub.id)
        } else {
          console.error('[notify-family] Send failed for sub', sub.id, err?.message ?? err)
        }
      }
    })
  )

  // ── 7. Cleanup and bookkeeping ─────────────────────────────────────────────

  const tasks: PromiseLike<unknown>[] = []

  if (successfulTokenIds.length > 0) {
    tasks.push(
      supabase
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .in('id', successfulTokenIds)
        .then()
    )
  }

  if (invalidTokenIds.length > 0) {
    tasks.push(
      supabase
        .from('push_subscriptions')
        .delete()
        .in('id', invalidTokenIds)
        .then()
    )
  }

  await Promise.all(tasks)

  res.status(200).json({ sent: successCount, failed: failureCount })
}
