-- ============================================================
-- Family Shared Calendar — Initial Schema
-- ============================================================

-- uuid-ossp not required — using gen_random_uuid() (built-in, Postgres 13+)

-- ============================================================
-- TABLES
-- ============================================================

-- Family groups (one per family)
create table public.family_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id) on delete cascade not null,
  created_at  timestamptz default now()
);

-- Family members (junction: user ↔ group, with role)
create table public.family_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references public.family_groups(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  role        text not null check (role in ('owner', 'editor', 'viewer')),
  invited_by  uuid references auth.users(id),
  joined_at   timestamptz default now(),
  unique (group_id, user_id)
);

-- Calendar events (source of truth)
create table public.calendar_events (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid references public.family_groups(id) on delete cascade not null,
  title            text not null,
  description      text,
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  location         text,
  is_all_day       boolean default false,
  is_recurring     boolean default false,
  -- RFC 5545 RRULE string e.g. "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10"
  recurrence_rule  text,
  created_by       uuid references auth.users(id),
  updated_by       uuid references auth.users(id),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Links events to their counterparts in Google Calendar / iCloud
-- sync_hash = sha256(title + start_at + end_at + location) — first 16 chars
-- Used to detect external changes without fetching full event body
create table public.calendar_event_links (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid references public.calendar_events(id) on delete cascade not null,
  provider             text not null check (provider in ('google', 'icloud')),
  external_event_id    text not null,
  external_calendar_id text not null,
  last_synced_at       timestamptz,
  sync_hash            text,
  unique (event_id, provider)
);

-- Processed emails — 15-day history stored in extension local storage,
-- this table is the cloud mirror for cross-device access
create table public.processed_emails (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade not null,
  gmail_message_id text not null,
  subject          text,
  sender           text,
  processed_at     timestamptz default now(),
  -- Array of proposed CalendarEvent-shaped objects
  proposed_events  jsonb,
  -- proposed: AI presented events, not yet acted on
  -- accepted: at least one event was added to calendar
  -- rejected: user dismissed all events
  -- partial: user accepted some, rejected others
  status           text check (status in ('proposed', 'accepted', 'rejected', 'partial')),
  unique (user_id, gmail_message_id)
);

-- Per-user Google / iCloud calendar connection credentials
-- Tokens are encrypted at the application layer before storage
create table public.user_calendar_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade not null,
  provider         text not null check (provider in ('google', 'icloud')),
  -- Encrypted access + refresh tokens
  access_token     text,
  refresh_token    text,
  -- For iCloud: the CalDAV calendar URL
  -- For Google: the calendar ID (usually primary email)
  calendar_id      text not null,
  sync_enabled     boolean default true,
  last_synced_at   timestamptz,
  unique (user_id, provider)
);

-- Per-user AI configuration (BYOK)
create table public.user_ai_settings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade not null unique,
  -- 'platform' = use the app's own OpenAI key
  provider            text check (provider in ('openai', 'gemini', 'claude', 'grok', 'platform'))
                      default 'platform',
  -- Encrypted API key (null when provider = 'platform' or gemini_uses_oauth = true)
  api_key_encrypted   text,
  -- If true, the user connected Gemini via Google OAuth (no API key needed)
  gemini_uses_oauth   boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- FCM / APNs push notification tokens
create table public.notification_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  fcm_token   text not null,
  platform    text check (platform in ('ios', 'android')),
  created_at  timestamptz default now(),
  unique (user_id, fcm_token)
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_calendar_events_updated_at
  before update on public.calendar_events
  for each row execute procedure public.set_updated_at();

create trigger trg_user_ai_settings_updated_at
  before update on public.user_ai_settings
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.family_groups            enable row level security;
alter table public.family_members           enable row level security;
alter table public.calendar_events          enable row level security;
alter table public.calendar_event_links     enable row level security;
alter table public.processed_emails         enable row level security;
alter table public.user_calendar_connections enable row level security;
alter table public.user_ai_settings         enable row level security;
alter table public.notification_tokens      enable row level security;

-- family_groups
create policy "Members can view their group"
  on public.family_groups for select
  using (
    exists (
      select 1 from public.family_members
      where family_members.group_id = family_groups.id
        and family_members.user_id  = auth.uid()
    )
  );

create policy "Authenticated users can create groups"
  on public.family_groups for insert
  with check (auth.uid() is not null);

create policy "Owner can update group"
  on public.family_groups for update
  using (created_by = auth.uid());

create policy "Owner can delete group"
  on public.family_groups for delete
  using (created_by = auth.uid());

-- family_members
create policy "Members can view family members"
  on public.family_members for select
  using (
    exists (
      select 1 from public.family_members fm
      where fm.group_id = family_members.group_id
        and fm.user_id  = auth.uid()
    )
  );

create policy "Owner can manage family members"
  on public.family_members for all
  using (
    exists (
      select 1 from public.family_members fm
      where fm.group_id = family_members.group_id
        and fm.user_id  = auth.uid()
        and fm.role     = 'owner'
    )
  );

-- calendar_events
create policy "Family members can view events"
  on public.calendar_events for select
  using (
    exists (
      select 1 from public.family_members
      where family_members.group_id = calendar_events.group_id
        and family_members.user_id  = auth.uid()
    )
  );

create policy "Editors and owners can insert events"
  on public.calendar_events for insert
  with check (
    exists (
      select 1 from public.family_members
      where family_members.group_id = calendar_events.group_id
        and family_members.user_id  = auth.uid()
        and family_members.role    in ('owner', 'editor')
    )
  );

create policy "Editors and owners can update events"
  on public.calendar_events for update
  using (
    exists (
      select 1 from public.family_members
      where family_members.group_id = calendar_events.group_id
        and family_members.user_id  = auth.uid()
        and family_members.role    in ('owner', 'editor')
    )
  );

create policy "Owners can delete events"
  on public.calendar_events for delete
  using (
    exists (
      select 1 from public.family_members
      where family_members.group_id = calendar_events.group_id
        and family_members.user_id  = auth.uid()
        and family_members.role     = 'owner'
    )
  );

-- calendar_event_links: readable by all family members, writable by service role only
create policy "Family members can view event links"
  on public.calendar_event_links for select
  using (
    exists (
      select 1 from public.calendar_events ce
      join public.family_members fm on fm.group_id = ce.group_id
      where ce.id          = calendar_event_links.event_id
        and fm.user_id     = auth.uid()
    )
  );

-- processed_emails: user sees only their own
create policy "Users can manage their own processed emails"
  on public.processed_emails for all
  using (user_id = auth.uid());

-- user_calendar_connections: user sees only their own
create policy "Users can manage their own calendar connections"
  on public.user_calendar_connections for all
  using (user_id = auth.uid());

-- user_ai_settings: user sees only their own
create policy "Users can manage their own AI settings"
  on public.user_ai_settings for all
  using (user_id = auth.uid());

-- notification_tokens: user sees only their own
create policy "Users can manage their own notification tokens"
  on public.notification_tokens for all
  using (user_id = auth.uid());

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_family_members_user_id    on public.family_members (user_id);
create index idx_family_members_group_id   on public.family_members (group_id);

create index idx_calendar_events_group_id  on public.calendar_events (group_id);
create index idx_calendar_events_start_at  on public.calendar_events (start_at);

create index idx_event_links_event_id      on public.calendar_event_links (event_id);
create index idx_event_links_provider      on public.calendar_event_links (provider);

create index idx_processed_emails_user_id  on public.processed_emails (user_id);
create index idx_processed_emails_date     on public.processed_emails (processed_at desc);

create index idx_notif_tokens_user_id      on public.notification_tokens (user_id);
