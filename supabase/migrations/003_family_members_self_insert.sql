-- Allow authenticated users to insert themselves into family_members.
-- This removes the SECURITY DEFINER chicken-and-egg problem:
-- the extension can now do two direct inserts (family_groups then family_members)
-- without needing a privileged RPC function.

create policy "Users can insert themselves as member"
  on public.family_members for insert
  with check (user_id = auth.uid());
