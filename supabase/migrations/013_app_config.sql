-- Add background polling settings to user_preferences
alter table public.user_preferences
  add column if not exists god_mode_subtype text not null default 'open'
    check (god_mode_subtype in ('open', 'poll')),
  add column if not exists poll_interval_hours integer not null default 2
    check (poll_interval_hours in (1, 2, 4, 6, 12, 24));

-- Global app config — admin-controlled feature flags (developer kill switch)
create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

alter table public.app_config enable row level security;

-- Authenticated users can read any flag; only service_role (SQL editor) can write
create policy "Authenticated read app_config"
  on public.app_config for select
  to authenticated
  using (true);

-- Seed the background polling kill switch (set value = 'false' to disable for all users)
insert into public.app_config (key, value)
values ('polling_enabled', 'true')
on conflict (key) do nothing;
