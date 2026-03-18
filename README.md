# Family Shared Calendar

A family-first calendar system that turns emails into shared events. A Gmail Chrome extension parses emails with AI and proposes calendar entries that the whole family can see in real time.

---

## Architecture Overview

```
Gmail → Chrome Extension (MV3)
              ↓
         AI Layer (Platform AI / BYOK — OpenAI / Gemini / Claude / Grok)
              ↓
         Supabase (source of truth — Postgres + Realtime + Auth)
              ↕  bidirectional sync
    Google Calendar ←→ iCloud (CalDAV)
              ↓
     GCP Cloud Functions (parse-email, calendar-webhook, icloud-sync-poll, notify-family)
              ↓
   Push Notifications (FCM / APNs)
```

---

## What's Been Built

### Chrome Extension (Manifest V3) — Fully Implemented

**Email Parsing**
- Injects a "Family Cal" button into Gmail's single-email toolbar via a content script (`gmail-injector.ts`)
- Sends email subject, body, sender, attachments, and in-page URLs to the AI layer
- Displays extracted events as proposal cards — user accepts, edits, or rejects each one
- On accept: event saved to Supabase and created in the user's Google Calendar

**God Mode (Background Polling)**
- Automatic mode: coming soon (UI option visible but disabled with "Soon" badge)
- Poll mode vs Open mode: open scans any unread email; poll mode filters by selected categories (school, work, sports, appointments, travel, etc.)
- Controlled via a kill switch in `app_config` table (admin can disable globally)
- Implemented via `chrome.alarms` in the MV3 service worker

**AI Routing**
- BYOK takes priority over platform AI
- BYOK providers: OpenAI (API key), Claude (API key), Grok (API key), Gemini (Google OAuth or API key)
- Platform fallback: GPT-4o primary → Gemini 2.0 Flash secondary
- In-context learning: up to 20 recent feedback events appended to the AI prompt for personalization
- URL content fetching: optionally extracts text from linked pages before parsing
- Attachment support: PDF and Word documents parsed server-side in the `parse-email` function

**Email History**
- 15-day scrollable history of processed emails
- Status badges: Pending / Added / Dismissed / Partial / Duplicate
- Tap any email to review its proposed events

**Family Calendar View**
- Mini month grid (iOS Calendar-style) — full month with colored event dots per family member
- Month navigation (`‹ March 2026 ›`) — navigates months, refetches data for the visible grid
- Agenda list for the selected day — tap any day to see events as a readable list
- Each event row: left-colored border, time column (start + end stacked), member color dot, title / location / creator name
- Conflict highlighting: ⚠ prefix + red left border on conflicting events
- "Today" button appears when viewing a different month
- Weekend dates shown in red; out-of-month dates grayed out
- Member filter chips: toggle individual family members on/off; state persists in `localStorage` per group
- Real-time updates via Supabase Realtime subscriptions on `calendar_events` and `family_members`

**Push Notifications & Family Invitations**
- After accepting an event, `NotifyMembersModal` slides up — pre-selects all family members; user can deselect any before tapping "Notify N members"
- Calls `notify-family` Cloud Function with a Supabase Bearer token and the list of target user IDs
- Function writes `event_invitations` rows, then fans out Web Push (Chrome, VAPID) and FCM (Android/iOS)
- Service worker `notificationclick` handler stores the invitation in `chrome.storage.local`; when the popup opens, `InvitationCard` is shown automatically
- `InvitationCard`: shows event title, date/time, location, description, and sender name; "Add to my calendar" creates a Google Calendar entry and upserts a `calendar_event_links` row; marks `added_at` on the invitation row
- Invalid/expired push tokens cleaned up automatically (HTTP 410 for Web Push; `registration-not-registered` for FCM)

**AI Conflict Resolution**
- Detects time-overlap conflicts across all family events
- `ConflictResolutionPanel` overlay: shows both conflicting events + AI-generated suggestions
- "Apply" button executes the chosen suggestion (shifts event time in Supabase)
- "Mark as OK" dismisses without changes
- **Duplicate detection**: if two conflicting events have identical or highly similar titles (one contains the other, or ≥ 60% word overlap on 3-char+ words), the panel switches to merge mode
- **Merge mode**: shows a blue "Looks like the same event" banner with a "Preview merged event" toggle (shows best title, min start, max end, combined location/description); "Merge into one" button updates the survivor event, migrates all `calendar_event_links` and `event_invitations` FK references from the deleted event, then deletes the duplicate — no migration required, handled entirely in code

**Family Setup & Invite Codes**
- Create a new family group (atomic RPC: creates group + adds creator as owner)
- Generate invite codes (8-char, configurable expiration, use limits)
- Preview family before joining — shows member names and colors
- Join by code via `join_family_group_by_code` RPC

**Member Management**
- Members panel lists all family members with role badges (Owner / Editor / Viewer)
- Rename member (nickname) and choose an avatar color (6 preset colors)
- Remove members (owner only)

**Settings**
- AI provider selection and BYOK key storage (encrypted in Supabase)
- Google Calendar connection toggle (uses existing Gmail OAuth — no re-auth required)
- God Mode on/off and interval selection
- Email category filtering for poll mode
- URL content fetching toggle
- Learning mode toggle

**UI Design**
- Bottom navigation bar (fixed 58px) with SVG icons for five tabs: History, Family Calendar, Members, Calendar, Settings
- Back-arrow header for secondary views (Members, Calendar Settings)
- Design token system via CSS custom properties in `index.html`
- Pill status badges, elevated cards, consistent color palette (`#1a73e8` blue, `#ea4335` red, `#1e7e34` green)
- 400 × 620 px popup with `overflow: hidden` body and scrollable content area

---

## Project Structure

```
family-shared-cal/
├── extension/                  # Chrome Extension (MV3)
│   ├── manifest.json
│   ├── src/
│   │   ├── background/
│   │   │   └── service-worker.ts       # OAuth, polling alarms, message routing
│   │   ├── content/
│   │   │   └── gmail-injector.ts       # Injects "Family Cal" button into Gmail
│   │   ├── lib/
│   │   │   ├── types.ts                # Central TypeScript interfaces
│   │   │   ├── ai.ts                   # AI routing, prompt building, learning context
│   │   │   ├── auth.ts                 # Google OAuth + Supabase session helpers
│   │   │   ├── gmail.ts                # Gmail DOM helpers
│   │   │   ├── gmail-api.ts            # Gmail REST API (readonly)
│   │   │   ├── google-calendar.ts      # Google Calendar API (create events)
│   │   │   ├── supabase.ts             # Supabase client
│   │   │   ├── conflicts.ts            # Conflict detection + DB row mapping
│   │   │   ├── preferences.ts          # God Mode category filtering
│   │   │   └── __tests__/             # Vitest tests
│   │   ├── popup/
│   │   │   ├── main.tsx
│   │   │   ├── types.ts                # Popup-scoped UI model types (CalendarEventUI, FamilyMemberUI, etc.)
│   │   │   ├── index.html              # CSS design tokens, 400×620 body
│   │   │   ├── App.tsx                 # Navigation, auth state, view routing
│   │   │   └── components/
│   │   │       ├── calendar/           # Calendar grid + agenda components
│   │   │       │   ├── AgendaEventCard.tsx
│   │   │       │   ├── AgendaPanel.tsx
│   │   │       │   ├── CalendarGrid.tsx
│   │   │       │   ├── CalendarHeader.tsx
│   │   │       │   ├── DayCell.tsx
│   │   │       │   ├── EventDetailSheet.tsx
│   │   │       │   ├── MemberFilterChips.tsx
│   │   │       │   ├── calendarUtils.ts
│   │   │       │   └── index.ts
│   │   │       ├── family/             # Family calendar view + conflict resolution
│   │   │       │   ├── FamilyCalendarView.tsx      # Mini month grid + agenda list
│   │   │       │   ├── ConflictResolutionPanel.tsx # AI conflict + duplicate merge overlay
│   │   │       │   └── index.ts
│   │   │       ├── members/            # Member management
│   │   │       │   ├── MembersPanel.tsx
│   │   │       │   ├── InviteCodeSection.tsx
│   │   │       │   ├── RenameMemberDialog.tsx
│   │   │       │   └── index.ts
│   │   │       ├── onboarding/         # First-run group setup
│   │   │       │   ├── FamilySetup.tsx
│   │   │       │   └── index.ts
│   │   │       ├── recents/            # Email history + event cards
│   │   │       │   ├── EmailHistory.tsx
│   │   │       │   ├── EventCard.tsx
│   │   │       │   ├── RecentItemCard.tsx
│   │   │       │   └── index.ts
│   │   │       ├── settings/           # AI + God Mode settings
│   │   │       │   ├── AISettings.tsx
│   │   │       │   ├── ConnectionStatusRow.tsx
│   │   │       │   ├── SettingsRow.tsx
│   │   │       │   └── index.ts
│   │   │       └── shared/
│   │   │           ├── ui/             # Reusable UI primitives
│   │   │           │   ├── AppShell.tsx
│   │   │           │   ├── TopBar.tsx
│   │   │           │   ├── SearchBar.tsx
│   │   │           │   ├── IconButton.tsx
│   │   │           │   ├── StatusChip.tsx
│   │   │           │   ├── TabBar.tsx
│   │   │           │   ├── SectionHeader.tsx
│   │   │           │   ├── ListRow.tsx
│   │   │           │   ├── Divider.tsx
│   │   │           │   ├── EmptyState.tsx
│   │   │           │   └── index.ts
│   │   │           └── overlays/       # Modal / overlay components
│   │   │               ├── CommandPalette.tsx
│   │   │               ├── FeedbackWidget.tsx
│   │   │               ├── InvitationCard.tsx      # Shown on push notification tap
│   │   │               ├── NotifyMembersModal.tsx  # Post-accept member notification selector
│   │   │               └── index.ts
│   │   ├── members/
│   │   │   └── MembersPage.tsx                 # Standalone members page
│   │   └── onboarding/
│   │       └── Onboarding.tsx                  # First-run setup flow
│   └── package.json
│
├── app/                        # Mobile App — Ionic React + Capacitor (iOS + Android)
│   ├── src/
│   │   ├── main.tsx                    # Ionic setup — platform-aware mode (md/ios)
│   │   ├── App.tsx                     # Router, tab nav, deep link OAuth handler
│   │   ├── lib/
│   │   │   └── supabase.ts             # Supabase client (flowType: implicit)
│   │   ├── hooks/
│   │   │   ├── useCalendarEvents.ts    # Fetches events for multiple groups
│   │   │   └── useRealtime.ts          # Supabase Realtime — one channel per group
│   │   └── pages/
│   │       ├── Auth.tsx                # Google + Apple OAuth (deep link on native)
│   │       ├── Calendar.tsx            # Month/week/day view + multi-group chip filter
│   │       ├── EventDetail.tsx         # View / edit / delete a single event
│   │       ├── EventForm.tsx           # Create / edit event form
│   │       ├── Onboarding.tsx          # Create or join a family group
│   │       ├── FamilyMembers.tsx       # Member list, role management, invite codes
│   │       └── Settings.tsx            # Calendar connections, AI provider, sign out
│   ├── android/                        # Android native project (Capacitor)
│   │   └── app/src/main/AndroidManifest.xml   # includes deep-link intent filter
│   ├── ios/                            # iOS native project (Capacitor)
│   ├── capacitor.config.ts
│   ├── vite.config.ts
│   └── package.json
│
├── functions/                  # GCP Cloud Functions (Node.js)
│   └── src/
│       ├── index.ts                    # Exports all 4 function handlers
│       ├── parse-email/index.ts        # AI email parsing endpoint
│       ├── calendar-webhook/index.ts   # Google Calendar push notifications
│       ├── icloud-sync-poll/index.ts   # iCloud CalDAV polling (Cloud Scheduler)
│       ├── notify-family/index.ts      # FCM/APNs push dispatcher
│       └── lib/
│           ├── ai.ts                   # OpenAI + Gemini + attachment parsing
│           ├── caldav.ts               # iCloud CalDAV client (tsdav)
│           ├── sync-hash.ts            # SHA256 hash idempotency for sync
│           ├── supabase.ts             # Supabase service-role client
│           └── google-calendar.ts      # Google Calendar API client
│
├── supabase/
│   └── migrations/             # 14 SQL migration files (see below)
│
├── docs/
│   ├── gcp-setup.md
│   ├── supabase-setup.md
│   └── google-dom-reference.md
│
└── README.md
```

---

## Database Schema

### Tables

| Table | Purpose |
|---|---|
| `family_groups` | One per family — name, created_by |
| `family_members` | User ↔ group junction — role (owner/editor/viewer), nickname, color |
| `user_profiles` | Public user info (email, display_name) visible to co-members |
| `family_invites` | Invite codes — code, expires_at, use_count, max_uses |
| `calendar_events` | Source of truth — title, description, start_at, end_at, location, is_all_day, is_recurring, recurrence_rule, created_by, updated_by |
| `calendar_event_links` | Maps events to Google/iCloud per user — user_id, external_event_id, provider, sync_hash, last_synced_at |
| `push_subscriptions` | Web Push / FCM tokens per user — user_id, platform (chrome/android/ios), token (endpoint URL or FCM token), subscription (Web Push JSON for Chrome), last_used_at |
| `event_invitations` | Per-user invitation records — event_id, from_user_id, to_user_id, seen_at, added_at; unique on (event_id, to_user_id) |
| `processed_emails` | 15-day parsing history — gmail_message_id, subject, sender, proposed_events (jsonb), status |
| `user_calendar_connections` | Per-user Google/iCloud OAuth credentials — access_token, refresh_token, calendar_id, sync_enabled |
| `user_ai_settings` | BYOK config — provider, api_key_encrypted, gemini_uses_oauth |
| `user_preferences` | God Mode config — mode, god_mode_subtype, poll_interval_hours, categories[], learning_enabled |
| `event_feedback` | AI learning data — ai_suggestion (json), user_action, correction (json) |
| `notification_tokens` | FCM/APNs device tokens — user_id, fcm_token, platform |
| `app_config` | Admin feature flags — key/value (e.g., polling_enabled kill switch) |

### RPC Functions

| Function | Description |
|---|---|
| `create_family_group(group_name)` | Atomically creates group + adds caller as owner (SECURITY DEFINER) |
| `join_family_group_by_code(invite_code)` | Validates code, checks expiry/limits, adds user as editor (SECURITY DEFINER) |
| `preview_family_by_code(invite_code)` | Returns family name + member list before joining (read-only) |

### Migrations

| File | What it adds |
|---|---|
| `001_initial_schema.sql` | All base tables, RLS policies, indexes, `set_updated_at()` trigger |
| `002_create_family_group_rpc.sql` | `create_family_group()` RPC — atomic group creation |
| `003_family_members_self_insert.sql` | RLS policy allowing users to insert themselves into a group |
| `004_fix_family_members_rls_recursion.sql` | Fixes infinite RLS recursion — adds `my_family_group_ids()` helper |
| `005_calendar_events_dedup.sql` | Unique index on `(group_id, title, start_at)` — prevents exact duplicates |
| `006_invite_and_profiles.sql` | `user_profiles` table, `family_invites` table, invite RLS policies |
| `007_join_by_code_rpc.sql` | `join_family_group_by_code()` RPC with transactional locking |
| `008_calendar_event_links_insert.sql` | RLS allowing editors/owners to insert event links |
| `009_user_preferences.sql` | `user_preferences` table — God Mode, email categories, learning flag |
| `010_event_feedback.sql` | `event_feedback` table — stores user corrections for in-context AI learning |
| `011_member_nicknames_colors.sql` | Adds `nickname` and `color` columns to `family_members` |
| `012_preview_family_by_code.sql` | `preview_family_by_code()` RPC — read-only family preview |
| `013_app_config.sql` | `app_config` table, `polling_enabled` kill switch, `god_mode_subtype` + `poll_interval_hours` to `user_preferences` |
| `014_push_and_invitations.sql` | `push_subscriptions` table (Web Push + FCM tokens); `event_invitations` table; adds `user_id` to `calendar_event_links` and changes unique constraint from `(event_id, provider)` to `(user_id, event_id, provider)` |

---

## Cloud Functions

### `parse-email` (POST)
Called by the extension when the user clicks "Family Cal" or God Mode finds an email.
1. Validates Supabase auth token
2. Fetches URL content server-side (direct fetch → Jina fallback)
3. Extracts text from PDF/Word attachments
4. Routes to OpenAI GPT-4o (primary) or Gemini 2.0 Flash (fallback)
5. Returns `ProposedEvent[]` with confidence scores

### `calendar-webhook` (POST)
Receives Google Calendar push notifications.
1. Verifies request origin (x-goog-channel-id header)
2. Fetches recently changed events from Google Calendar API
3. Compares `sync_hash` (SHA256 of title + start + end + location); skips if unchanged
4. Updates Supabase on change; marks deleted if status = `cancelled`
- **Debounce**: 30 seconds to prevent sync ping-pong

### `icloud-sync-poll` (POST, Cloud Scheduler every 10 min)
Polls iCloud CalDAV for all users with `sync_enabled = true`.
1. Fetches events via `tsdav` CalDAV client (app-specific password)
2. Compares `sync_hash` per event; updates Supabase on change
3. Deletes events that disappeared from iCloud within the poll window (7 days past → 90 days future)
- **No auto-import**: does not flood Supabase with existing iCloud events on first connect

### `notify-family` (POST, called explicitly from extension)
Called by the extension after the user accepts an event and selects recipients in `NotifyMembersModal`. Validates the caller's Supabase JWT internally (`--allow-unauthenticated` on GCP; auth enforced in code).
1. Validates Supabase Bearer token; `fromUserId` in body must match authenticated user
2. Fetches event details + sender display name from `family_members`
3. Upserts one `event_invitations` row per target user
4. Fetches `push_subscriptions` for target users
5. Sends **Web Push** (VAPID) for `platform = 'chrome'` via `web-push` npm package
6. Sends **FCM** for `platform = 'android'` / `'ios'` via Firebase Admin SDK
7. Cleans up invalid tokens automatically (HTTP 410 from push service = unsubscribed; `registration-not-registered` from FCM)
8. Updates `last_used_at` on successful sends

---

## Key TypeScript Types

```typescript
// AI-extracted event proposal
interface ProposedEvent {
  title: string
  description?: string
  startAt: string          // ISO 8601
  endAt: string
  location?: string
  isAllDay: boolean
  isRecurring: boolean
  recurrenceRule?: string  // RFC 5545 RRULE
  confidence: 'high' | 'medium' | 'low'
  alreadyAdded?: boolean
}

// Family calendar event (from Supabase)
interface CalendarEvent {
  id: string
  title: string
  description?: string
  startAt: string
  endAt: string
  location?: string
  isAllDay: boolean
  createdBy?: string       // user_id
  creatorName?: string     // resolved from family_members
  creatorColor?: string    // hex color
}

// Overlapping event pair for conflict detection
interface ConflictPair {
  eventA: CalendarEvent
  eventB: CalendarEvent
}

// AI and God Mode settings
interface AISettings {
  provider: 'platform' | 'openai' | 'gemini' | 'claude' | 'grok'
  apiKey?: string
  geminiUsesOAuth?: boolean
  fetchUrlContent?: boolean
  godMode?: 'automatic' | 'manual' | 'disabled'
  godModeSubtype?: 'open' | 'poll'
  pollIntervalHours?: number  // 1 | 2 | 4 | 6 | 12 | 24
  categories?: string[]
  learningEnabled?: boolean
}

// Family member with avatar customization
interface FamilyMember {
  id: string
  userId: string
  role: 'owner' | 'editor' | 'viewer'
  joinedAt: string
  email?: string
  nickname?: string
  color?: string  // e.g. '#1a73e8'
}
```

---

## Calendar Sync Design

**Supabase is the source of truth.** Google Calendar and iCloud are kept in sync as copies.

- **Outbound** (Supabase → Google/iCloud): triggered on every event create/edit/delete
- **Inbound from Google**: push notifications via `calendar-webhook` Cloud Function
- **Inbound from iCloud**: CalDAV polling every 10 min via `icloud-sync-poll` (iCloud has no webhooks)
- **Idempotency**: `sync_hash` column on `calendar_event_links` stores SHA256[:16] of `title + start + end + location` — sync jobs skip writes when the hash is unchanged
- **Conflict resolution**: last-write-wins with 30-second debounce to prevent ping-pong
- **Duplicate detection**: unique constraint on `(group_id, title, start_at)` prevents exact duplicates; `alreadyAdded` flag surfaced in event card UI

---

## AI Design

### Routing Priority
1. **BYOK** (if configured) — user's own key, runs in extension directly
2. **Platform AI** — GPT-4o primary, Gemini 2.0 Flash fallback via `parse-email` Cloud Function

### Providers
| Provider | Auth method | Where called |
|---|---|---|
| OpenAI (BYOK) | User API key | Extension (client-side) |
| Claude (BYOK) | User API key | Extension (client-side) |
| Grok (BYOK) | User API key | Extension (client-side) |
| Gemini (BYOK OAuth) | Google OAuth token | Extension (client-side) |
| OpenAI GPT-4o (platform) | Server-side key | `parse-email` function |
| Gemini 2.0 Flash (fallback) | Server-side key | `parse-email` function |

### In-Context Learning
- Up to 20 most recent `event_feedback` rows are appended to the AI system prompt
- Each feedback item includes: original AI suggestion, user action (accept/reject/correct), and correction JSON
- `learningEnabled` flag in user preferences controls this per-user

---

## Tech Stack

| Layer | Technology |
|---|---|
| Chrome Extension | React 18 + Vite + TypeScript + Chrome Manifest V3 |
| Extension testing | Vitest + jsdom |
| Mobile app | Ionic React + Capacitor (single codebase → iOS + Android) |
| Backend DB & Auth | Supabase (Postgres, Auth, Realtime) |
| Serverless functions | GCP Cloud Functions (Node.js) |
| AI primary | OpenAI GPT-4o |
| AI fallback | Google Gemini 2.0 Flash |
| Calendar sync | Google Calendar API (webhooks) + iCloud CalDAV via tsdav (polling) |
| Push notifications | Web Push (VAPID) for Chrome + Firebase Cloud Messaging for Android/iOS |
| Auth | Google OAuth (Chrome identity API) + Supabase Auth + Apple OAuth (mobile) |

---

## Extension Permissions

```json
"permissions": ["storage", "identity", "activeTab", "scripting", "tabs", "alarms", "notifications"],
"host_permissions": [
  "https://mail.google.com/*",
  "https://*.supabase.co/*",
  "https://www.googleapis.com/calendar/*",
  "https://gmail.googleapis.com/*",
  "https://people.googleapis.com/*"
]
```

**OAuth scopes**: `openid`, `email`, `profile`, `gmail.readonly`, `calendar.events`, `contacts.readonly`, `cloud-platform` (optional, for Gemini BYOK)

---

## Local Development

```bash
# Extension
cd extension
npm install
npm run dev        # watch mode build → dist/
npm run build      # production build
npm run typecheck  # TypeScript check (no emit)
npm run test       # run tests once
npm run test:watch # watch mode tests

# Load extension in Chrome:
# chrome://extensions → Developer mode → Load unpacked → select extension/dist/

# Cloud Functions
cd functions
npm install
npm run build
# Deploy: gcloud functions deploy parse-email --runtime nodejs20 --trigger-http ...

# Mobile App
cd app
npm install
npm run build          # Vite production build → dist/
npx cap sync android   # copy web assets + plugins → android/
npx cap sync ios       # copy web assets + plugins → ios/
npx cap open android   # open in Android Studio
npx cap open ios       # open in Xcode (macOS only)

# Supabase Auth config required:
# Dashboard → Auth → URL Configuration → Redirect URLs → add: com.familycal.app://**
```

---

## Environment Variables

```env
# Supabase (extension — via vite .env)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Supabase (functions — server-side)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# GCP
GCP_PROJECT_ID=
GCP_REGION=

# AI — Platform keys (server-side only, never in extension)
OPENAI_API_KEY=
GEMINI_API_KEY=

# Google Calendar OAuth (server-side)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Firebase (push notifications)
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=

# Web Push VAPID (functions — server-side only)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_CONTACT=mailto:your@email.com

# Extension — notify-family endpoint + Web Push
VITE_NOTIFY_FAMILY_URL=https://REGION-PROJECT.cloudfunctions.net/notifyFamily
VITE_VAPID_PUBLIC_KEY=
```

# Mobile App (app/.env)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

> User BYOK API keys are stored **encrypted in Supabase** (`user_ai_settings.api_key_encrypted`), never in environment variables or extension storage.

---

## Docs

- [`docs/gcp-setup.md`](docs/gcp-setup.md) — GCP project, Cloud Functions deployment, Cloud Scheduler, Firebase
- [`docs/supabase-setup.md`](docs/supabase-setup.md) — Supabase project setup, migrations, RLS policies

---

## Roadmap

### Implemented
- [x] Supabase schema — all 13 migrations applied
- [x] Chrome Extension — Gmail button injection, email parsing, event proposals
- [x] AI routing layer — platform AI + BYOK (OpenAI, Claude, Grok, Gemini OAuth + API key)
- [x] In-context learning from user feedback
- [x] God Mode — automatic background email scanning with configurable intervals and category filters
- [x] Google Calendar connection + event creation on accept
- [x] Family group creation, invite codes, join-by-code flow
- [x] Family member management — roles, nicknames, avatar colors
- [x] Email history (15-day, 5 status states)
- [x] Family Calendar View — iOS-style mini month grid + agenda list
- [x] Member filter (per-member color chips, localStorage persistence)
- [x] Conflict detection — overlapping events flagged with ⚠
- [x] AI conflict resolution panel (suggests time shifts, applies via Supabase update)
- [x] Duplicate event detection in conflict panel — "Looks like the same event" banner with merge preview and "Merge into one" button; migrates FK references in code, no migration needed
- [x] Real-time updates via Supabase Realtime on calendar and member changes
- [x] Calendar sync design — `calendar-webhook`, `icloud-sync-poll`, `notify-family` functions
- [x] Modern popup UI — bottom nav, design token system, pill badges, consistent color palette
- [x] Admin kill switch (`app_config.polling_enabled`) for God Mode
- [x] Push notification system — Web Push (VAPID) for Chrome + FCM for Android/iOS; `push_subscriptions` table; service worker subscription + `notificationclick` handler
- [x] `notify-family` refactored to explicit HTTP POST with Supabase JWT auth (no longer a DB webhook)
- [x] `NotifyMembersModal` — post-accept multi-select notification UI
- [x] `InvitationCard` — overlay shown on push notification tap; "Add to my calendar" flow with per-user `calendar_event_links`
- [x] `event_invitations` table — tracks seen_at / added_at per recipient
- [x] Migration 014 — `push_subscriptions`, `event_invitations`, `user_id` on `calendar_event_links`
- [x] Keyboard accessibility — `DayCell`, `CalendarHeader`, `AgendaEventCard` support Enter/Space activation, `focus-visible` ring, `aria-label`
- [x] Component architecture reorganization — domain-driven subfolders (`calendar/`, `family/`, `members/`, `onboarding/`, `recents/`, `settings/`, `shared/ui/`, `shared/overlays/`); barrel `index.ts` per folder; popup-scoped UI types in `popup/types.ts`
- [x] God Mode "Automatic" option disabled with "Soon" badge (not yet implemented)
- [x] Delete group bug fix — `onGroupDeleted` callback removes deleted group from parent state; prevents ghost entries when deleting the last group
- [x] Horizontal padding consistency — `CalendarGrid` aligned to `px-4` (was `px-3`); "show more" button in `EmailHistory` padded to match

### Mobile App
- [x] App scaffolded — Ionic React + Capacitor, single codebase for iOS + Android
- [x] Auth — Google + Apple OAuth via Supabase (`flowType: 'implicit'`)
- [x] Android OAuth deep link — `@capacitor/browser` opens Chrome Custom Tab; `appUrlOpen` listener in `App.tsx` parses hash tokens and calls `supabase.auth.setSession()`; AndroidManifest intent filter for `com.familycal.app://`; Supabase wildcard redirect URL `com.familycal.app://**`
- [x] Calendar view — month/week/day list, real-time Supabase Realtime sync
- [x] Multi-group calendar — user can belong to multiple family groups; horizontal scrollable chip filter ("All" + one chip per group); group name badge on events when viewing all groups; `useCalendarEvents` and `useRealtimeEvents` accept `groupIds: string[]`
- [x] Event create/edit/delete — role-based (owner/editor/viewer); FAB hidden for viewers
- [x] Onboarding — create family group or join by invite code
- [x] Family members page — nicknames, color dots, role management, invite code generation; fixed `created_by` null constraint bug
- [x] Settings — Google Calendar + iCloud connect/disconnect; AI provider selection + BYOK key (upserts to `user_ai_settings`); sign out
- [x] Push notifications — Capacitor FCM registration writes to `push_subscriptions`; tap navigates to event detail
- [x] Android + iOS native projects scaffolded (`cap add android`, `cap add ios`); Firebase config files placed
- [x] Platform-aware Ionic mode (Material Design on Android, iOS style on iOS)

### Pending / Phase 2
- [ ] **TODO (requires Mac): iOS Push Notifications capability** — open Xcode → App target → Signing & Capabilities → add Push Notifications
- [ ] Google Calendar connect on mobile — needs same deep link treatment as auth (`skipBrowserRedirect`, capture `provider_token` from hash)
- [ ] Multi-group FamilyMembers page — currently shows one group; needs group selector to switch between groups the user belongs to
- [ ] iCloud CalDAV credential storage and sync activation UI
- [ ] Multi-email selection in extension
- [ ] Recurring event editing (one / all / this-and-following)
- [ ] BYOK via local Ollama
- [ ] Richer notification preferences per user
