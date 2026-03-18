-- RPC: create a family group and add the caller as owner atomically.
-- Uses SECURITY DEFINER so the membership insert bypasses the RLS
-- chicken-and-egg (you can't be an owner before the row exists).

create or replace function public.create_family_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group_id uuid;
begin
  insert into public.family_groups (name, created_by)
  values (group_name, auth.uid())
  returning id into new_group_id;

  insert into public.family_members (group_id, user_id, role)
  values (new_group_id, auth.uid(), 'owner');

  return new_group_id;
end;
$$;

-- Only authenticated users can call it
revoke all on function public.create_family_group(text) from public;
grant execute on function public.create_family_group(text) to authenticated;
