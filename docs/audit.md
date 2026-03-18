# Family Shared Calendar — Full Codebase Audit

> Generated: March 2026

---

## 1. Executive Summary

Family Shared Calendar is a working MVP consisting of a Chrome MV3 extension, a cross-platform mobile app (iOS + Android via Ionic/Capacitor), four GCP Cloud Functions, and a Supabase backend. The core loop — Gmail email → AI extraction → family calendar → push notification — is fully implemented. Real-time sync, CalDAV (iCloud) polling, Google Calendar webhook, BYOK AI providers, and invite-code-based family management are all in place. The project is approximately **72% complete** toward a shippable v1.0. Key gaps are: no automated tests, no CI/CD, a stubbed mobile Settings page, and Google Calendar sync not yet wired to the extension's accept button (events save to Supabase but are not automatically pushed to the user's personal Google Calendar).

---

## 2. Platform Status Matrix

| Platform | % Complete | Core Features Working | Major Gaps |
|---|---|---|---|
| **Chrome Extension** | 85% | Email extraction, AI parsing, event accept/reject, history, members, onboarding | Calendar sync on accept not wired; no tests |
| **Mobile App (iOS/Android)** | 70% | Auth, calendar view, event CRUD, realtime updates, push notifications | Settings page stub; email invite TODO; Google/iCloud connect UI missing |
| **Supabase Backend** | 90% | All tables, RLS policies, RPCs, realtime, migrations 001–007 | user_profiles & family_invites only just added (migration 006/007 not yet applied) |
| **GCP Cloud Functions** | 80% | parse-email, calendar-webhook, icloud-sync-poll, notify-family deployed | Correct region not configured in deploy scripts; no tests |
| **Google Calendar Sync** | 60% | Inbound webhook handler complete; `google-calendar.ts` lib complete | Extension accept button does not call createGoogleEvent(); CalDAV lib untested in prod |
| **iCloud Sync** | 55% | Polling logic complete, CalDAV lib complete | Not auto-tested; no UI to connect iCloud credentials |
| **Documentation** | 60% | gcp-setup.md, supabase-setup.md, README.md | No API docs, no onboarding guide for contributors |
| **Testing / CI** | 0% | — | No unit tests, no integration tests, no CI/CD pipeline |

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER DEVICES                                │
│                                                                     │
│  ┌──────────────────┐          ┌──────────────────────────────────┐ │
│  │  Chrome Extension│          │  Mobile App (Ionic/Capacitor)    │ │
│  │  (Gmail + popup) │          │  iOS  ·  Android                 │ │
│  └────────┬─────────┘          └──────────────┬───────────────────┘ │
└───────────┼──────────────────────────────────┼─────────────────────┘
            │                                  │
            │ REST / Supabase JS               │ Supabase JS / Realtime
            ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SUPABASE                                     │
│  Auth (Google + Apple)  ·  PostgreSQL + RLS  ·  Realtime            │
│                                                                     │
│  Tables: family_groups, family_members, calendar_events,            │
│          calendar_event_links, processed_emails,                    │
│          user_calendar_connections, user_ai_settings,               │
│          notification_tokens, user_profiles, family_invites         │
│                                                                     │
│  RPCs: create_family_group(), join_family_group_by_code()           │
│  Webhooks → notify-family Cloud Function                            │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               │ HTTPS calls
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GCP CLOUD FUNCTIONS (Gen2)                       │
│                                                                     │
│  parse-email          — AI email parsing (GPT-4o → Gemini fallback) │
│  calendar-webhook     — inbound Google Calendar push notifications  │
│  icloud-sync-poll     — CalDAV polling (Cloud Scheduler, 10 min)   │
│  notify-family        — FCM/APNs push to all family members         │
└───────┬──────────────────────┬──────────────────────────────────────┘
        │                      │
        ▼                      ▼
 ┌─────────────┐     ┌──────────────────┐
 │ OpenAI API  │     │ Google Calendar  │
 │ Gemini API  │     │ API  (events)    │
 │ Anthropic   │     ├──────────────────┤
 │ xAI Grok    │     │ iCloud CalDAV    │
 └─────────────┘     │ (tsdav)          │
                     ├──────────────────┤
                     │ Firebase FCM     │
                     │ (push notif.)    │
                     └──────────────────┘
```

---

## 4. Chrome Extension — Detailed Status

### Infrastructure
- **Manifest:** v3, complete. Permissions: `storage, identity, activeTab, scripting, alarms, tabs`. Host permissions: `mail.google.com/*`, `*.supabase.co/*`.
- **Build:** Vite 5, four entry points: `popup`, `onboarding`, `background`, `content`. Builds cleanly.
- **Service worker:** Keep-alive alarm, Google OAuth, Gmail attachment fetch, onboarding tab on install.

### Gmail Integration
| Feature | Status |
|---|---|
| Button injection into email toolbar | ✅ Working (MutationObserver, multi-selector fallback) |
| Extract subject | ✅ Working |
| Extract sender email | ✅ Working |
| Extract body text | ✅ Working |
| Extract attachment descriptions | ✅ Working |
| Download PDF/Word attachments | ✅ Working (Gmail API via background script) |
| Extract URLs from body | ✅ Working (with tracking-URL filter) |
| Detect email on SPA navigation | ✅ Working (MutationObserver with 8s timeout) |

### AI Parsing
| Provider | Status |
|---|---|
| Platform (OpenAI GPT-4o → Gemini fallback) | ✅ Cloud Function |
| BYOK Gemini (OAuth) | ✅ Implemented |
| BYOK OpenAI (API key) | ✅ Implemented |
| BYOK Claude (Anthropic API key) | ✅ Implemented |
| BYOK Grok (xAI) | ✅ Implemented |
| URL content fetching | ✅ Server-side (Cloud Function), no browser permission needed |
| PDF attachment parsing | ✅ Server-side (pdf-parse) |
| Word/DOCX parsing | ✅ Server-side (mammoth) |

### Extension Views
| View | Status |
|---|---|
| Auth (Google sign-in) | ✅ Complete |
| Onboarding (new tab, 4 steps) | ✅ Complete |
| Family Setup (create group) | ✅ Complete |
| Join Group (invite code) | ✅ Complete |
| Parse (event cards, accept/reject) | ✅ Complete |
| History (15-day, click to re-view) | ✅ Complete |
| Members panel (invite code, remove) | ✅ Complete |
| AI Settings (provider + BYOK keys) | ✅ Complete |
| Deduplication (client + DB constraint) | ✅ Complete |

### What's Missing in the Extension
1. **Google Calendar sync on accept** — `handleAcceptEvent()` saves to Supabase only. It does not call the Google Calendar API to add the event to the user's personal calendar. The Cloud Function `google-calendar.ts` library exists but is not called from the extension path.
2. **iCloud connect UI** — there is no way for a user to enter their iCloud credentials (Apple ID + app-specific password) through the extension or mobile app.
3. **No tests** — no unit or integration tests for any extension code.

---

## 5. Mobile App — Detailed Status

**Stack:** React 18 · Ionic 8 · Capacitor 6 · Vite · TypeScript
**Targets:** iOS (`npx cap run ios`) · Android (`npx cap run android`)

### Pages
| Page | Route | Status |
|---|---|---|
| Auth | `/auth` | ✅ Google OAuth + Apple Sign In |
| Calendar | `/calendar` | ✅ Month/week/day view, realtime events, FAB |
| Event Detail | `/calendar/:eventId` | ✅ Create/edit/delete, role-gated |
| Family Members | `/family` | ⚠️ Member list + role management done; invite flow stubbed (`// Phase 2`) |
| Settings | `/settings` | ❌ File not found in src/pages — likely empty stub |

### Key Capabilities
| Feature | Status |
|---|---|
| Supabase auth (Google + Apple) | ✅ |
| Calendar event CRUD | ✅ |
| Realtime event updates | ✅ (Supabase Realtime, `useRealtime` hook) |
| Push notifications (FCM + APNs) | ✅ (Capacitor Push Plugin, `useNotifications` hook) |
| Role-based UI gating | ✅ (owners delete, editors edit, viewers read-only) |
| Family member management | ⚠️ List + role change done; invite by code not in app (extension-only) |
| Google Calendar connect | ❌ No UI to connect Google Calendar |
| iCloud connect | ❌ No UI to enter iCloud credentials |
| Offline mode | ❌ Not implemented |
| Event search | ❌ Not implemented |

### Build Commands
```bash
cd app
npm run build          # Vite build → dist/
npx cap sync           # copy to iOS/Android native projects
npx cap run ios        # run on iOS simulator/device
npx cap run android    # run on Android emulator/device
```

---

## 6. Supabase — Detailed Status

### Schema (10 Tables)

| Table | Purpose | RLS | Status |
|---|---|---|---|
| `family_groups` | One row per family | Owner can edit; members can view | ✅ |
| `family_members` | User ↔ group junction, role | SECURITY DEFINER helpers for recursion-safe policies | ✅ |
| `calendar_events` | Source of truth for all events | Editors+ write; members read; owners delete | ✅ |
| `calendar_event_links` | Maps events to Google/iCloud | Service role write only; members read | ✅ |
| `processed_emails` | Per-user 15-day cloud mirror | Users own their rows | ✅ |
| `user_calendar_connections` | OAuth tokens for Google/iCloud | Users own their rows | ✅ |
| `user_ai_settings` | BYOK AI provider settings | Users own their rows | ✅ |
| `notification_tokens` | FCM/APNs device tokens | Users own their rows | ✅ |
| `user_profiles` | Email/name for member display | Own + co-member read | ✅ (migration 006, needs apply) |
| `family_invites` | 8-char invite codes, 7-day expiry | Owners create/delete; all auth read | ✅ (migration 006, needs apply) |

### RPCs
| Function | Purpose | Status |
|---|---|---|
| `create_family_group(name)` | Atomically creates group + owner member | ✅ |
| `join_family_group_by_code(code)` | Validates invite code, adds editor member | ✅ (migration 007, needs apply) |
| `my_family_group_ids()` | SECURITY DEFINER: group IDs for current user | ✅ |
| `my_owned_group_ids()` | SECURITY DEFINER: owned group IDs | ✅ |

### Migrations to Apply
Migrations **005, 006, 007** have been written but **must be applied** in the Supabase SQL editor:
- `005_calendar_events_dedup.sql` — unique index on `(group_id, title, start_at)`
- `006_invite_and_profiles.sql` — `user_profiles` + `family_invites` tables
- `007_join_by_code_rpc.sql` — `join_family_group_by_code()` RPC

### Configuration
- Realtime must be enabled for `calendar_events` table (Supabase dashboard)
- Database webhook must point to `notify-family` Cloud Function URL
- Google OAuth provider must be configured in Supabase Auth settings

---

## 7. GCP Services — Detailed Status

### Cloud Functions (Gen2, Node.js 20)

| Function | Trigger | Status | Notes |
|---|---|---|---|
| `parse-email` | HTTP POST | ✅ Deployed | Requires Supabase auth token; OpenAI primary, Gemini fallback |
| `calendar-webhook` | HTTP POST | ✅ Deployed | Google Calendar push channel; debounce 30s |
| `icloud-sync-poll` | HTTP POST (Cloud Scheduler) | ✅ Deployed | Runs every 10 min via cron |
| `notify-family` | HTTP POST (Supabase webhook) | ✅ Deployed | FCM multicast; cleans invalid tokens |

### Deploy Command (correct, from prior session)
```bash
# Run from functions/ directory in Google Cloud SDK Shell
gcloud functions deploy parse-email \
  --gen2 --runtime nodejs20 --trigger-http \
  --allow-unauthenticated \
  --source . --entry-point parseEmail \
  --region YOUR_ACTUAL_REGION   # ← replace with e.g. europe-west2
```
> **Note:** The `deploy:*` scripts in `functions/package.json` still have `--source dist/parse-email` which is incorrect. Use `--source . --entry-point parseEmail` as above.

### Required Environment Variables (set via Cloud Console)
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
OPENAI_API_KEY
GEMINI_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
FIREBASE_SERVICE_ACCOUNT_JSON
```

### Other GCP Services
| Service | Status | Notes |
|---|---|---|
| Cloud Scheduler | Needs setup | `*/10 * * * *` → `icloud-sync-poll` |
| Firebase Cloud Messaging | Needs credentials | `google-services.json` (Android), `GoogleService-Info.plist` (iOS) |
| Google Calendar API | Enabled, lib complete | Not yet called from extension accept flow |
| Google Contacts API | Not used | Was referenced in planning (R1 rule) but not implemented |

---

## 8. Data Flow Diagrams

### 8.1 Email → Calendar Event (Platform AI path)

```
User opens email in Gmail
         │
         ▼
Content script injects "Family Cal" button
         │
User clicks button
         │
         ▼
gmail-injector.ts: extractEmailContent()
  → subject, sender, body, attachment names, URLs
         │
         ▼
chrome.storage.local.set({ pendingEmail })
chrome.runtime.sendMessage → background opens popup
         │
         ▼
Popup: App.tsx handleParse()
  → isAlreadyProcessed() guard
  → FETCH_ATTACHMENTS → service-worker → Gmail API → PDF/Word base64
  → URLs stripped if fetchUrlContent=false
         │
         ▼
callPlatformAI() → POST /parse-email (Cloud Function)
  → fetchUrls() (if URLs present)
  → extractAttachmentTexts() (pdf-parse / mammoth)
  → callOpenAI() → GPT-4o
      on failure → callGemini() → Gemini 2.0 Flash
         │
         ▼
Returns: { proposedEvents: [...] }
         │
         ▼
EventCard shown to user (title, date, confidence badge)
         │
User clicks "Add to Family Cal"
         │
         ▼
App.tsx handleAcceptEvent()
  → supabase.from('calendar_events').insert(...)
  → saveToHistory('accepted')

⚠️ MISSING: createGoogleEvent() not called here
```

### 8.2 Calendar Sync (Google Calendar inbound)

```
User edits event in Google Calendar
         │
         ▼
Google Calendar sends push notification
  → POST /calendar-webhook (Cloud Function)
         │
         ▼
Lookup channel → get user's Google OAuth token
Fetch modified events (last 60 seconds)
Check calendar_event_links for our event_id
Compare sync_hash → skip if unchanged
         │
         ▼
Update calendar_events in Supabase
Update sync_hash + last_synced_at in calendar_event_links
         │
         ▼
Supabase Realtime → mobile app updates live
```

### 8.3 Push Notifications

```
Any user accepts/modifies/deletes a calendar_events row
         │
         ▼
Supabase Database Webhook fires
  → POST /notify-family (Cloud Function)
         │
         ▼
Fetch all family_members for group_id
Fetch notification_tokens for those users
         │
         ▼
Firebase Admin SDK: sendMulticast()
  → FCM (Android) + APNs (iOS)
         │
         ▼
Mobile app: useNotifications hook shows IonToast
```

---

## 9. Critical Blockers

### Blocker 1 — Migrations 005–007 Not Applied
**Impact:** Deduplication (unique constraint), invite codes, and user profiles are all broken until these three SQL files are run in Supabase.
**Fix:** Run `005_calendar_events_dedup.sql`, `006_invite_and_profiles.sql`, `007_join_by_code_rpc.sql` in the Supabase SQL editor.
**Effort:** 5 minutes.

### Blocker 2 — Extension Accept Does Not Sync to Google Calendar
**Impact:** When a user clicks "Add to Family Cal", the event is saved to Supabase but does not appear in the user's Google Calendar. The `google-calendar.ts` library exists but is never called from the extension accept path.
**Fix:** In `handleAcceptEvent()`, after the Supabase insert succeeds, call the Cloud Function (or a new endpoint) that calls `createGoogleEvent()` using the user's stored OAuth token.
**Effort:** Medium (2–4 hours).

### Blocker 3 — Mobile App Settings Page Missing
**Impact:** Users cannot connect their Google Calendar or iCloud from the app. The `user_calendar_connections` table is fully designed but there is no UI to store OAuth tokens.
**Fix:** Implement `src/pages/Settings.tsx` with Google Calendar OAuth connect + iCloud credential entry form.
**Effort:** Medium (4–6 hours).

### Blocker 4 — GCP Deploy Scripts Use Wrong `--source` Path
**Impact:** `npm run deploy:*` in `functions/package.json` uses `--source dist/parse-email` which fails. The correct invocation uses `--source . --entry-point parseEmail`.
**Fix:** Update the four deploy scripts in `functions/package.json`.
**Effort:** 10 minutes.

### Blocker 5 — No Tests or CI/CD
**Impact:** Any change to the Cloud Functions, RLS policies, or extension logic is deployed without a safety net. Regressions (like the RLS recursion bug from earlier) are caught only after users report them.
**Fix:** Add vitest unit tests for the AI parsing, sync hash, and CalDAV parsing logic. Add a GitHub Actions workflow that runs typecheck + tests on PR.
**Effort:** High (1–2 days for meaningful coverage).

---

## 10. Completeness Assessment

| Area | % Done | Notes |
|---|---|---|
| Auth flow (all platforms) | 95% | Working end-to-end |
| Email extraction | 90% | Gmail DOM + API attachments |
| AI parsing | 85% | All BYOK providers + platform fallback |
| Deduplication | 80% | Code complete; DB migration needs applying |
| Family group management | 85% | Create, join by code, member list, role management |
| Calendar CRUD (mobile) | 85% | Full CRUD, realtime, role gating |
| Invite codes (extension) | 80% | Code complete; DB migration needs applying |
| Invite codes (mobile app) | 20% | Stubbed, needs Phase 2 |
| Push notifications | 80% | Logic complete; Firebase credentials needed per deployment |
| Google Calendar sync (outbound) | 30% | Library exists; not wired to accept flow |
| Google Calendar sync (inbound) | 70% | Webhook handler complete |
| iCloud sync | 60% | Poll logic complete; no connect UI |
| Mobile Settings page | 5% | Stub only |
| Onboarding (extension) | 95% | Full 4-step flow |
| Documentation | 60% | Setup guides exist; no API docs or contributor guide |
| Tests | 0% | None |
| CI/CD | 0% | None |

**Overall: ~72% complete**

---

## 11. Top 5 Recommended Actions

### 1. Apply migrations 005–007 (5 min, Critical)
Run the three pending SQL files in Supabase SQL editor. Nothing added in the last session works without this.

### 2. Fix GCP deploy scripts (10 min, High)
In `functions/package.json`, change all four `deploy:*` scripts from `--source dist/<name>` to `--source . --entry-point <FunctionName>`. This is why deploys were failing.

### 3. Wire Google Calendar sync on event accept (Medium, 2–4 hours)
After `handleAcceptEvent()` inserts to Supabase, call a new Cloud Function endpoint (or extend `parse-email`) that uses the user's stored `user_calendar_connections` Google token to call `createGoogleEvent()`. Store the returned `external_event_id` in `calendar_event_links`. This is the most visible missing feature.

### 4. Build mobile Settings page (Medium, 4–6 hours)
Implement `app/src/pages/Settings.tsx` with:
- "Connect Google Calendar" → OAuth flow → store in `user_calendar_connections`
- "Connect iCloud" → Apple ID + app-specific password form → store encrypted in `user_calendar_connections`
- Sign out button

### 5. Add basic tests and CI (High effort, 1–2 days)
- Add vitest to `functions/` for `sync-hash.ts`, `caldav.ts`, AI parsing
- Add a GitHub Actions workflow: install deps → typecheck → run tests on push
- Prevents regressions on the most complex logic (sync, RLS policies)

---

## 12. Technical Debt

| Item | Severity | Notes |
|---|---|---|
| `.env` files committed to git | 🔴 Critical | If keys are real, rotate them immediately. Add to `.gitignore`. |
| Hardcoded OAuth client IDs in source | 🟡 Medium | `manifest.json` and `auth.ts` expose Google client ID — acceptable for extensions but document it |
| `functions/package.json` deploy scripts wrong | 🟡 Medium | `--source dist/parse-email` should be `--source . --entry-point parseEmail` |
| No error boundary in mobile app | 🟡 Medium | A crash anywhere in the React tree shows a blank screen |
| `FamilyMembers.tsx` 4-member cap hardcoded | 🟢 Low | `invite button hidden if >= 4` — remove when Phase 2 invite-in-app is built |
| `Settings.tsx` missing | 🔴 High | App cannot function fully without connect-calendar flow |
| No retry logic on Cloud Function failures | 🟡 Medium | If `parse-email` fails, user sees an error with no retry option |

---

## 13. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gmail DOM selectors break on Gmail update | High | High | Add multiple selector fallbacks (already partially done); monitor with MutationObserver |
| OpenAI API key exhausted | Medium | High | Gemini fallback already implemented |
| Supabase RLS regression on schema change | Medium | High | Write tests; use SECURITY DEFINER helpers |
| FCM tokens expire silently | Low | Medium | Token cleanup on failed send already implemented |
| iCloud password change breaks sync | Medium | Medium | Alert user when CalDAV auth fails; surface in Settings |
| Google Calendar OAuth token expiry | Medium | High | `user_calendar_connections` has `refresh_token` but refresh logic not implemented in `calendar-webhook` |
| Chrome Extension update breaks content script | Low | Medium | Build CI + automated E2E test against Gmail sandbox |

---

## 14. Open Questions / Decisions Needed

1. **Google Calendar sync on accept** — Should the extension push directly to Google Calendar when a user accepts, or should this be a separate "sync" step? Pushing immediately is better UX but requires the user to have connected their Google Calendar.

2. **iCloud credentials** — Apple does not provide OAuth for CalDAV. The current approach stores an Apple ID + app-specific password. Is the security model (encrypted at rest in Supabase) acceptable to your users?

3. **4-member cap** — Is this a permanent product decision or an MVP constraint? If permanent, add a paywall/upgrade flow. If temporary, remove it when the invite flow is extended to the mobile app.

4. **Google Calendar OAuth refresh** — The `calendar-webhook` function uses stored `access_token` but does not refresh it when expired. When does this break, and how to handle it?

5. **Monetization** — The project uses `platform AI` (your OpenAI key) for users who don't bring their own key. Is there a rate limit or billing plan for this? What's the cost per parse?

6. **Multi-group support** — The schema supports it (no unique constraint on `user_id` in `family_members`) but the extension only loads the first group. Is this intentional?

---

## 15. Project Structure Reference

```
family-shared-cal/
├── extension/                  # Chrome MV3 extension (React + Vite)
│   ├── manifest.json
│   ├── popup.html
│   ├── onboarding.html
│   ├── vite.config.ts
│   ├── src/
│   │   ├── background/service-worker.ts
│   │   ├── content/gmail-injector.ts
│   │   ├── onboarding/Onboarding.tsx
│   │   ├── popup/App.tsx
│   │   ├── popup/components/
│   │   │   ├── AISettings.tsx
│   │   │   ├── EmailHistory.tsx
│   │   │   ├── EventCard.tsx
│   │   │   ├── FamilySetup.tsx
│   │   │   ├── InviteCodeSection.tsx
│   │   │   ├── JoinGroup.tsx
│   │   │   └── MembersPanel.tsx
│   │   └── lib/
│   │       ├── ai.ts           # AI routing (BYOK + platform)
│   │       ├── auth.ts         # Google OAuth helper
│   │       ├── gmail.ts        # DOM injection + email extraction
│   │       ├── supabase.ts     # Supabase client (chrome.storage.local)
│   │       └── types.ts        # Shared TypeScript types
│   └── dist/                   # Built output (load this in chrome://extensions)
│
├── app/                        # Ionic/Capacitor mobile app (iOS + Android)
│   ├── capacitor.config.ts
│   ├── src/
│   │   ├── App.tsx             # Router + tab layout
│   │   ├── pages/
│   │   │   ├── Auth.tsx
│   │   │   ├── Calendar.tsx
│   │   │   ├── EventDetail.tsx
│   │   │   ├── FamilyMembers.tsx
│   │   │   └── Settings.tsx    # ⚠️ Stub — needs implementing
│   │   ├── hooks/
│   │   │   ├── useCalendarEvents.ts
│   │   │   ├── useNotifications.ts
│   │   │   └── useRealtime.ts
│   │   └── lib/
│   │       ├── notifications.ts
│   │       └── supabase.ts
│   ├── ios/                    # Xcode project (generated by cap sync)
│   └── android/                # Android Studio project (generated by cap sync)
│
├── functions/                  # GCP Cloud Functions (Node.js 20 + TypeScript)
│   ├── src/
│   │   ├── index.ts            # Exports all 4 handlers
│   │   ├── parse-email/        # AI parsing endpoint
│   │   ├── calendar-webhook/   # Google Calendar inbound sync
│   │   ├── icloud-sync-poll/   # CalDAV polling
│   │   ├── notify-family/      # FCM/APNs push notifications
│   │   └── lib/
│   │       ├── ai.ts           # OpenAI + Gemini + attachment parsing
│   │       ├── caldav.ts       # iCloud CalDAV (tsdav)
│   │       ├── google-calendar.ts  # Google Calendar API
│   │       ├── supabase.ts     # Service role client
│   │       └── sync-hash.ts    # SHA-256 change detection
│   └── package.json
│
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql      ✅ Applied
│       ├── 002_create_family_group_rpc.sql ✅ Applied
│       ├── 003_family_members_self_insert.sql ✅ Applied
│       ├── 004_fix_family_members_rls_recursion.sql ✅ Applied
│       ├── 005_calendar_events_dedup.sql   ⚠️ Needs applying
│       ├── 006_invite_and_profiles.sql     ⚠️ Needs applying
│       └── 007_join_by_code_rpc.sql        ⚠️ Needs applying
│
├── docs/
│   ├── audit.md                # This file
│   ├── gcp-setup.md
│   └── supabase-setup.md
│
└── README.md                   # Architecture overview
```

---

## 16. Dependency Map

```
Chrome Extension depends on:
  ├── Supabase (auth, calendar_events, user_ai_settings, family_members)
  ├── parse-email Cloud Function (platform AI path)
  ├── Gmail DOM API (content script)
  ├── Gmail REST API (attachment download via background script)
  ├── Google OAuth (chrome.identity)
  ├── OpenAI API (BYOK)
  ├── Anthropic API (BYOK Claude)
  ├── xAI API (BYOK Grok)
  └── Gemini API (BYOK OAuth)

Mobile App depends on:
  ├── Supabase (auth, calendar_events, family_members, realtime)
  ├── Firebase FCM (push notifications)
  └── Capacitor plugins (Push Notifications, Browser)

Cloud Functions depend on:
  ├── Supabase (service role — all tables)
  ├── OpenAI API (parse-email)
  ├── Gemini API (parse-email fallback)
  ├── Google Calendar API (calendar-webhook, future: event create)
  ├── tsdav / CalDAV (icloud-sync-poll)
  ├── Firebase Admin SDK (notify-family)
  ├── pdf-parse (parse-email attachments)
  └── mammoth (parse-email Word attachments)

Supabase is depended on by:
  ├── Chrome Extension
  ├── Mobile App (iOS + Android)
  └── All 4 Cloud Functions
```
