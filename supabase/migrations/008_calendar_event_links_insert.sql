-- Allow family members (editors/owners) to insert calendar event links
-- for events that belong to their group.
-- Previously calendar_event_links was insert-restricted to service role only.
create policy "Members can insert event links"
  on public.calendar_event_links for insert
  with check (
    exists (
      select 1 from public.calendar_events ce
      join public.family_members fm on fm.group_id = ce.group_id
      where ce.id = calendar_event_links.event_id
        and fm.user_id = auth.uid()
        and fm.role in ('owner', 'editor')
    )
  );
