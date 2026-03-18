# Supabase Setup Guide

Step-by-step guide to configure Supabase for the Family Calendar project.

---

## 1. Create a Supabase Project

1. Go to https://supabase.com and sign in
2. Click **New project**
3. Name: `family-cal`
4. Database password: generate a strong password and save it
5. Region: choose closest to your users
6. Click **Create new project** — takes ~2 minutes

---

## 2. Get Your Project Keys

Go to **Project Settings → API**:

| Key | Where to use |
|---|---|
| **Project URL** | `VITE_SUPABASE_URL` (extension + app), `SUPABASE_URL` (functions) |
| **anon public key** | `VITE_SUPABASE_ANON_KEY` (extension + app), `SUPABASE_ANON_KEY` (parse-email function) |
| **service_role secret** | `SUPABASE_SERVICE_KEY` (functions only — never expose to clients) |

---

## 3. Run the Database Migration

In the Supabase dashboard, go to **SQL Editor** and run the contents of:

```
supabase/migrations/001_initial_schema.sql
```

This creates all tables, RLS policies, triggers, and indexes.

Alternatively, if you have the Supabase CLI:
```bash
npx supabase db push
```

---

## 4. Configure Google OAuth

1. In Supabase dashboard: **Authentication → Providers → Google**
2. Toggle **Enable**
3. Enter your **Client ID** and **Client Secret** from GCP (see `docs/gcp-setup.md` step 3)
4. Copy the **Callback URL** shown — add it to your GCP OAuth client's authorized redirect URIs

---

## 5. Configure Apple Sign In

1. You need an Apple Developer account ($99/year)
2. In Apple Developer Portal:
   - Create an **App ID** with Sign In with Apple capability: `com.familycal.app`
   - Create a **Services ID**: `com.familycal.web`
   - Add the Supabase callback URL to the Services ID redirect URLs:
     ```
     https://<your-project>.supabase.co/auth/v1/callback
     ```
   - Create a **Key** with Sign In with Apple enabled — download the `.p8` file
3. In Supabase dashboard: **Authentication → Providers → Apple**
   - Toggle **Enable**
   - Enter: Services ID, Team ID, Key ID, and paste the `.p8` key contents

---

## 6. Configure Realtime

Supabase Realtime is needed for live calendar updates in the mobile app.

1. Go to **Database → Replication**
2. Enable replication for the `calendar_events` table
3. That's it — the `useRealtimeEvents` hook in the app subscribes automatically

---

## 7. Set Up Database Webhook for Notifications

After deploying the `notify-family` Cloud Function (see `docs/gcp-setup.md` step 7):

1. Go to **Database → Webhooks** (enable the feature if prompted)
2. Click **Create a new hook**:
   - Name: `notify-family`
   - Schema: `public`
   - Table: `calendar_events`
   - Events: ✅ Insert ✅ Update ✅ Delete
   - Type: HTTP Request
   - Method: POST
   - URL: `https://us-central1-family-cal-prod.cloudfunctions.net/notify-family`
   - HTTP Headers: add `Authorization: Bearer <your-supabase-service-key>`
3. Click **Confirm**

---

## 8. Storage (Attachments — Future)

If you later add attachment support for parsed emails:

1. Go to **Storage → Create bucket**
2. Name: `email-attachments`
3. Public: No
4. Add a storage policy allowing users to read/write only their own files:
   ```sql
   -- Allow users to upload to their own folder
   create policy "Users can upload their attachments"
     on storage.objects for insert
     with check (bucket_id = 'email-attachments' and auth.uid()::text = (storage.foldername(name))[1]);

   -- Allow users to read their own attachments
   create policy "Users can read their attachments"
     on storage.objects for select
     using (bucket_id = 'email-attachments' and auth.uid()::text = (storage.foldername(name))[1]);
   ```

---

## 9. Environment Variables (.env files)

### Extension (`extension/.env`)
```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_PARSE_EMAIL_URL=https://us-central1-family-cal-prod.cloudfunctions.net/parse-email
```

### App (`app/.env`)
```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Schema Overview

```
family_groups           — one per family
family_members          — up to 4 members per group, with role (owner/editor/viewer)
calendar_events         — source of truth for all events
calendar_event_links    — Google/iCloud event IDs + sync_hash for idempotency
processed_emails        — 15-day extension email history (cloud mirror)
user_calendar_connections — encrypted Google/iCloud credentials per user
user_ai_settings        — BYOK AI config per user
notification_tokens     — FCM/APNs tokens for push notifications
```

## RLS Summary

| Table | Read | Write |
|---|---|---|
| `family_groups` | all members of the group | owner only |
| `family_members` | all members of the group | owner only |
| `calendar_events` | all members | editors + owners |
| `calendar_event_links` | all members | service role only (Cloud Functions) |
| `processed_emails` | own rows only | own rows only |
| `user_calendar_connections` | own row only | own row only |
| `user_ai_settings` | own row only | own row only |
| `notification_tokens` | own rows only | own rows only |
