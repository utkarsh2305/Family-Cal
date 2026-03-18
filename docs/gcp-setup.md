# GCP Setup Guide

Step-by-step guide to configure Google Cloud Platform for the Family Calendar backend.

---

## Prerequisites

- Google account
- `gcloud` CLI installed: https://cloud.google.com/sdk/docs/install
- Node.js 20+ installed

---

## 1. Create a GCP Project

```bash
gcloud projects create family-cal-prod --name="Family Calendar"
gcloud config set project family-cal-prod
```

Enable billing on the project at https://console.cloud.google.com/billing

---

## 2. Enable Required APIs

```bash
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com \
  run.googleapis.com \
  calendar-json.googleapis.com \
  gmail.googleapis.com \
  firebase.googleapis.com \
  firebaseinstallations.googleapis.com
```

---

## 3. Configure OAuth Credentials (Google Calendar + Gmail)

1. Go to https://console.cloud.google.com/apis/credentials
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `Family Calendar`
5. Authorized redirect URIs: add your Supabase auth callback URL:
   ```
   https://<your-supabase-project>.supabase.co/auth/v1/callback
   ```
6. Click **Create** — download the JSON
7. Note the **Client ID** and **Client Secret** — you'll need them in:
   - Supabase Auth settings (Google provider)
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars on Cloud Functions
   - `manifest.json` in the Chrome extension (`oauth2.client_id`)

**Required OAuth scopes:**
```
openid
email
profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/generative-language   ← for BYOK Gemini
```

---

## 4. Set Up Firebase (Push Notifications)

1. Go to https://console.firebase.google.com
2. Click **Add project** → select your existing GCP project `family-cal-prod`
3. Enable **Cloud Messaging** in the Firebase console
4. Register your apps:
   - **Android**: add package name `com.familycal.app`
   - **iOS**: add bundle ID `com.familycal.app`
5. Download:
   - `google-services.json` → place in `app/android/app/`
   - `GoogleService-Info.plist` → place in `app/ios/App/App/`
6. Generate a **Service Account key** for server-side FCM:
   - Firebase console → Project Settings → Service Accounts
   - Click **Generate new private key** → download JSON
   - Minify the JSON and store as `FIREBASE_SERVICE_ACCOUNT_JSON` env var

---

## 5. Deploy Cloud Functions

Build first:
```bash
cd functions
npm install
npm run build
```

Set environment variables (replace values):
```bash
gcloud functions deploy parse-email \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars SUPABASE_URL=https://xxx.supabase.co \
  --set-env-vars SUPABASE_ANON_KEY=eyJ... \
  --set-env-vars SUPABASE_SERVICE_KEY=eyJ... \
  --set-env-vars OPENAI_API_KEY=sk-... \
  --set-env-vars GEMINI_API_KEY=AIza... \
  --source dist/parse-email \
  --entry-point handler

gcloud functions deploy calendar-webhook \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars SUPABASE_URL=https://xxx.supabase.co \
  --set-env-vars SUPABASE_SERVICE_KEY=eyJ... \
  --set-env-vars GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com \
  --set-env-vars GOOGLE_CLIENT_SECRET=GOCSPX-... \
  --source dist/calendar-webhook \
  --entry-point handler

gcloud functions deploy icloud-sync-poll \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --trigger-http \
  --no-allow-unauthenticated \
  --set-env-vars SUPABASE_URL=https://xxx.supabase.co \
  --set-env-vars SUPABASE_SERVICE_KEY=eyJ... \
  --source dist/icloud-sync-poll \
  --entry-point handler

gcloud functions deploy notify-family \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --trigger-http \
  --no-allow-unauthenticated \
  --set-env-vars SUPABASE_URL=https://xxx.supabase.co \
  --set-env-vars SUPABASE_SERVICE_KEY=eyJ... \
  --set-env-vars FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
  --source dist/notify-family \
  --entry-point handler
```

After deploy, note the URLs for each function:
```
https://us-central1-family-cal-prod.cloudfunctions.net/parse-email
https://us-central1-family-cal-prod.cloudfunctions.net/calendar-webhook
https://us-central1-family-cal-prod.cloudfunctions.net/icloud-sync-poll
https://us-central1-family-cal-prod.cloudfunctions.net/notify-family
```

---

## 6. Set Up Cloud Scheduler (iCloud Poll)

```bash
# Create a service account for the scheduler to call the function
gcloud iam service-accounts create icloud-scheduler \
  --display-name="iCloud Sync Scheduler"

# Grant it permission to invoke the function
gcloud functions add-invoker-policy-binding icloud-sync-poll \
  --region us-central1 \
  --member="serviceAccount:icloud-scheduler@family-cal-prod.iam.gserviceaccount.com"

# Create the schedule (every 10 minutes)
gcloud scheduler jobs create http icloud-sync-every-10min \
  --location us-central1 \
  --schedule "*/10 * * * *" \
  --uri "https://us-central1-family-cal-prod.cloudfunctions.net/icloud-sync-poll" \
  --http-method POST \
  --oidc-service-account-email "icloud-scheduler@family-cal-prod.iam.gserviceaccount.com"
```

---

## 7. Set Up Supabase Database Webhook (notify-family)

In the Supabase dashboard:
1. Go to **Database → Webhooks**
2. Create a new webhook:
   - Name: `notify-family`
   - Table: `calendar_events`
   - Events: **Insert**, **Update**, **Delete**
   - URL: `https://us-central1-family-cal-prod.cloudfunctions.net/notify-family`
   - HTTP method: POST
   - Add header: `Authorization: Bearer <supabase_service_key>`

---

## 8. Chrome Extension — Register OAuth

1. Go to https://console.cloud.google.com/apis/credentials
2. Edit your OAuth client
3. Add the extension's origin to **Authorized JavaScript origins**:
   ```
   chrome-extension://<your-extension-id>
   ```
   (Find your extension ID in `chrome://extensions` after loading unpacked)
4. Update `manifest.json` `oauth2.client_id` with your actual Client ID

---

## Environment Variables Reference

| Variable | Used by | Description |
|---|---|---|
| `SUPABASE_URL` | all functions | Supabase project URL |
| `SUPABASE_ANON_KEY` | parse-email | Public anon key (for user token verification) |
| `SUPABASE_SERVICE_KEY` | all functions | Service role key (bypasses RLS) |
| `OPENAI_API_KEY` | parse-email | Platform OpenAI key |
| `GEMINI_API_KEY` | parse-email | Gemini fallback key |
| `GOOGLE_CLIENT_ID` | calendar-webhook | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | calendar-webhook | OAuth client secret |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | notify-family | Firebase service account JSON (minified) |
| `GCP_REGION` | deploy scripts | e.g. `us-central1` |
