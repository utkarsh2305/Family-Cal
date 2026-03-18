-- RPC: join a family group using an invite code.
-- SECURITY DEFINER so it can bypass RLS to atomically check + insert.

create or replace function public.join_family_group_by_code(invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  -- Lock the invite row to prevent race conditions on the use_count
  select * into inv
  from public.family_invites
  where code = upper(trim(invite_code))
    and expires_at > now()
    and use_count < max_uses
  for update;

  if not found then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;

  -- Prevent double-joining
  if exists (
    select 1 from public.family_members
    where group_id = inv.group_id and user_id = auth.uid()
  ) then
    return jsonb_build_object('error', 'already_member', 'group_id', inv.group_id);
  end if;

  -- Add the user as an editor
  insert into public.family_members (group_id, user_id, role, invited_by)
  values (inv.group_id, auth.uid(), 'editor', inv.created_by);

  -- Mark code as used
  update public.family_invites
  set use_count = use_count + 1
  where id = inv.id;

  return jsonb_build_object('ok', true, 'group_id', inv.group_id);
end;
$$;

revoke all on function public.join_family_group_by_code(text) from public;
grant execute on function public.join_family_group_by_code(text) to authenticated;
