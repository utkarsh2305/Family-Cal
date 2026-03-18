-- User God Mode preferences: processing mode, email categories, AI learning toggle
create table if not exists public.user_preferences (
  user_id          uuid primary key references auth.users on delete cascade,
  mode             text not null default 'manual'
                     check (mode in ('automatic', 'manual', 'disabled')),
  categories       text[] not null default array['school','work','sports','appointments','travel'],
  learning_enabled boolean not null default true,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table public.user_preferences enable row level security;

create policy "Users manage own preferences"
  on public.user_preferences for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger set_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();
