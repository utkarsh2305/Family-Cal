-- Stores user feedback on AI-proposed events (accept / reject / correct).
-- Used to build per-user learning context included in future AI prompts.
create table if not exists public.event_feedback (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  group_id      uuid references public.family_groups on delete cascade,
  event_id      uuid references public.calendar_events on delete set null,
  ai_suggestion jsonb not null,   -- snapshot of ProposedEvent at suggestion time
  user_action   text not null check (user_action in ('accept', 'reject', 'correct')),
  correction    jsonb,             -- edited ProposedEvent if user_action = 'correct'
  feedback_type text check (feedback_type in ('correct', 'wrong', 'ask-next-time')),
  created_at    timestamptz default now()
);

alter table public.event_feedback enable row level security;

create policy "Users manage own feedback"
  on public.event_feedback for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index on public.event_feedback (user_id, created_at desc);
