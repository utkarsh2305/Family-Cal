-- Prevent exact duplicate events being added to the same group
create unique index if not exists uq_calendar_events_dedup
  on public.calendar_events (group_id, title, start_at);
