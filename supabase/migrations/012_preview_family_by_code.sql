-- Lets an authenticated non-member preview a family before joining.
-- SECURITY DEFINER so it can bypass RLS on family_members / family_groups.
create or replace function public.preview_family_by_code(invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite  family_invites%rowtype;
  v_group   family_groups%rowtype;
  v_members jsonb;
begin
  select * into v_invite
    from family_invites
   where upper(trim(code)) = upper(trim(invite_code))
     and expires_at > now()
     and use_count < max_uses;

  if not found then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;

  select * into v_group from family_groups where id = v_invite.group_id;

  select jsonb_agg(jsonb_build_object(
    'nickname', fm.nickname,
    'color',    coalesce(fm.color, '#1a73e8'),
    'email',    up.email
  ))
  into v_members
  from family_members fm
  left join user_profiles up on up.id = fm.user_id
  where fm.group_id = v_invite.group_id;

  return jsonb_build_object(
    'family_id',   v_group.id,
    'family_name', v_group.name,
    'members',     coalesce(v_members, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.preview_family_by_code(text) from public;
grant execute on function public.preview_family_by_code(text) to authenticated;
