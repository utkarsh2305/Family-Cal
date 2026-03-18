-- ── User profiles ─────────────────────────────────────────────────────────────
-- Stores a public-facing email/name for each user so members can see who's in
-- their group (auth.users is not directly readable by the anon key).

create table public.user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text
);

alter table public.user_profiles enable row level security;

-- Users can read and write only their own profile
create policy "Own profile"
  on public.user_profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- Co-members of the same family group can view each other's profiles
create policy "Co-members can view profiles"
  on public.user_profiles for select
  using (
    id in (
      select fm.user_id from public.family_members fm
      where fm.group_id in (select public.my_family_group_ids())
    )
  );


-- ── Invite codes ───────────────────────────────────────────────────────────────
-- Owners generate short-lived codes that new members enter to join the group.

create table public.family_invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references public.family_groups(id) on delete cascade not null,
  code        text not null unique,          -- 8-char uppercase alphanumeric
  created_by  uuid references auth.users(id) on delete cascade not null,
  created_at  timestamptz default now(),
  expires_at  timestamptz not null,          -- typically created_at + 7 days
  use_count   int default 0,
  max_uses    int default 1
);

alter table public.family_invites enable row level security;

-- Any authenticated user can look up a code to validate it
create policy "Lookup by code"
  on public.family_invites for select
  using (auth.uid() is not null);

-- Only group owners can create invite codes
create policy "Owners create invites"
  on public.family_invites for insert
  with check (group_id in (select public.my_owned_group_ids()));

-- Only group owners can revoke invite codes
create policy "Owners delete invites"
  on public.family_invites for delete
  using (group_id in (select public.my_owned_group_ids()));

create index idx_family_invites_code     on public.family_invites (code);
create index idx_family_invites_group_id on public.family_invites (group_id);
