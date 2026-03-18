-- Fix infinite recursion in family_members RLS.
--
-- Root cause: the "Owner can manage family members" policy is FOR ALL with a
-- USING clause that queries family_members — so every INSERT/UPDATE/DELETE
-- triggers a SELECT on the same table, which re-evaluates all policies → recursion.
--
-- Fix: use SECURITY DEFINER helper functions (run as postgres, bypass RLS)
-- for any policy that needs to check membership in family_members.

-- ── Helper functions ──────────────────────────────────────────────────────────

create or replace function public.my_family_group_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select group_id from family_members where user_id = auth.uid();
$$;

create or replace function public.my_owned_group_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select group_id from family_members
  where user_id = auth.uid() and role = 'owner';
$$;

grant execute on function public.my_family_group_ids() to authenticated;
grant execute on function public.my_owned_group_ids()  to authenticated;

-- ── Drop the recursive policies ───────────────────────────────────────────────

drop policy if exists "Members can view family members"   on public.family_members;
drop policy if exists "Owner can manage family members"   on public.family_members;

-- ── Recreate without recursion ────────────────────────────────────────────────

-- SELECT: any member of the same group can see other members
create policy "Members can view family members"
  on public.family_members for select
  using (group_id in (select public.my_family_group_ids()));

-- UPDATE/DELETE: only owners can modify membership
create policy "Owners can update family members"
  on public.family_members for update
  using (group_id in (select public.my_owned_group_ids()));

create policy "Owners can delete family members"
  on public.family_members for delete
  using (group_id in (select public.my_owned_group_ids()));

-- INSERT is handled by "Users can insert themselves as member" (migration 003)
-- which has no self-referential check: WITH CHECK (user_id = auth.uid())
