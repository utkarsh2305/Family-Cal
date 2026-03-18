-- ============================================================
-- Migration 014: Push Subscriptions, Event Invitations,
--                calendar_event_links multi-user support
-- ============================================================
-- Changes:
--   1. push_subscriptions   — replaces notification_tokens
--                             supports Chrome (Web Push) + Android/iOS (FCM)
--                             multiple devices per user supported
--   2. event_invitations    — tracks who was notified about an event,
--                             read/added state for badge counts
--   3. calendar_event_links — adds user_id so multiple family members
--                             can each link the same family event to
--                             their own personal Google/iCloud calendar
-- ============================================================


-- ── 1. push_subscriptions ─────────────────────────────────────────────────

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  platform     text not null check (platform in ('chrome', 'android', 'ios')),

  -- Unique identifier per device / browser installation:
  --   Chrome  → endpoint URL from the Web PushSubscription object
  --   Android → FCM device token
  --   iOS     → FCM device token (APNs routed via FCM)
  token        text not null,

  -- Chrome only: full Web Push subscription JSON
  --   { endpoint, expirationTime, keys: { p256dh, auth } }
  -- Null for Android / iOS (token field is sufficient)
  subscription jsonb,

  created_at   timestamptz default now(),

  -- Updated on every successful push send — used to detect stale tokens
  last_used_at timestamptz,

  -- Same device re-registering upserts rather than inserting a duplicate
  unique (user_id, token)
);

alter table public.push_subscriptions enable row level security;

-- Users register and manage their own devices only
create policy "Users manage their own push subscriptions"
  on public.push_subscriptions for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Migrate existing notification_tokens rows ─────────────────────────────
-- notification_tokens stored one FCM token per row (user_id, fcm_token unique)
-- Map: fcm_token → token, platform stays the same, subscription = null

insert into public.push_subscriptions (user_id, platform, token, created_at)
select user_id, platform, fcm_token, created_at
from   public.notification_tokens
on conflict (user_id, token) do nothing;

-- Drop old table (RLS policy and index are dropped automatically)
drop table public.notification_tokens;

-- Indexes
create index idx_push_subs_user_id on public.push_subscriptions (user_id);
create index idx_push_subs_token   on public.push_subscriptions (token);


-- ── 2. event_invitations ──────────────────────────────────────────────────
-- Created when an acceptor chooses to notify specific family members.
-- Drives: push notification send, badge counts (unseen), receipt confirmation.

create table public.event_invitations (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references public.calendar_events(id) on delete cascade not null,
  from_user_id uuid references auth.users(id) on delete cascade not null,
  to_user_id   uuid references auth.users(id) on delete cascade not null,
  sent_at      timestamptz default now(),

  -- null = unread; set when recipient opens the invitation card in the extension
  seen_at      timestamptz,

  -- null = not added; set when recipient taps "Add to my calendar"
  added_at     timestamptz,

  -- Prevent duplicate invitations for the same event → same recipient
  unique (event_id, to_user_id)
);

alter table public.event_invitations enable row level security;

-- Recipients read and update their own invitations (seen_at, added_at)
create policy "Recipients can read their invitations"
  on public.event_invitations for select
  using (to_user_id = auth.uid());

create policy "Recipients can update their invitations"
  on public.event_invitations for update
  using (to_user_id = auth.uid())
  with check (to_user_id = auth.uid());

-- Senders can read invitations they created (to display "invited" status)
create policy "Senders can read invitations they sent"
  on public.event_invitations for select
  using (from_user_id = auth.uid());

-- Editors / owners can send invitations for events in their group
create policy "Family members can send invitations"
  on public.event_invitations for insert
  with check (
    from_user_id = auth.uid()
    and exists (
      select 1 from public.calendar_events ce
      join  public.family_members fm on fm.group_id = ce.group_id
      where ce.id        = event_invitations.event_id
        and fm.user_id   = auth.uid()
        and fm.role     in ('owner', 'editor')
    )
  );

-- Indexes
create index idx_event_inv_to_user  on public.event_invitations (to_user_id);
create index idx_event_inv_event_id on public.event_invitations (event_id);
-- Partial index for unread count queries (seen_at is null = unread)
create index idx_event_inv_unread   on public.event_invitations (to_user_id, sent_at desc)
  where seen_at is null;


-- ── 3. calendar_event_links: per-user personal calendar links ─────────────
--
-- Problem with old schema:  unique (event_id, provider)
--   → only ONE link allowed per Supabase event per provider
--   → breaks when a second family member adds the same event to their
--     own Google / iCloud calendar
--
-- Fix: add user_id so each family member has their own link row.
--   unique (user_id, event_id, provider)
--   → Sarah's Google link and Emma's Google link coexist for the same event
--
-- Existing rows (created before this migration) have user_id = null.
-- NULL values do not participate in unique constraint checks in SQL,
-- so legacy rows are unaffected.

alter table public.calendar_event_links
  add column user_id uuid references auth.users(id) on delete cascade;

-- Drop the old single-link-per-event constraint
-- Postgres auto-names unnamed unique constraints as {table}_{cols}_key
alter table public.calendar_event_links
  drop constraint if exists calendar_event_links_event_id_provider_key;

-- New constraint: one personal-calendar link per user per event per provider
alter table public.calendar_event_links
  add constraint calendar_event_links_user_event_provider_key
  unique (user_id, event_id, provider);

create index idx_event_links_user_id on public.calendar_event_links (user_id);

-- ── Update INSERT policy (from migration 008) ─────────────────────────────
-- Previous policy allowed any editor/owner to insert a link but did not
-- enforce user_id. New policy additionally requires user_id = auth.uid()
-- when user_id is provided (service-role inserts may leave it null).

drop policy if exists "Members can insert event links" on public.calendar_event_links;

create policy "Members can insert event links"
  on public.calendar_event_links for insert
  with check (
    -- When user_id is set it must match the calling user
    (user_id is null or user_id = auth.uid())
    and exists (
      select 1 from public.calendar_events ce
      join  public.family_members fm on fm.group_id = ce.group_id
      where ce.id       = calendar_event_links.event_id
        and fm.user_id  = auth.uid()
        and fm.role    in ('owner', 'editor')
    )
  );

-- Users can update their own event links (e.g. sync_hash refresh after re-add)
-- Service role bypasses RLS for sync function updates
create policy "Users can update their own event links"
  on public.calendar_event_links for update
  using (user_id = auth.uid() or user_id is null);
