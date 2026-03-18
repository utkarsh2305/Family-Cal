-- Add nickname and color customization to family members.
-- nickname: display name shown to all family members (max 30 chars)
-- color:    hex color for avatar circle (one of 6 preset values)
alter table public.family_members
  add column if not exists nickname text
    check (char_length(nickname) <= 30),
  add column if not exists color text
    check (color in (
      '#d93025',  -- Red
      '#1a73e8',  -- Blue
      '#137333',  -- Green
      '#7c4dff',  -- Purple
      '#e37400',  -- Orange
      '#e91e8c'   -- Pink
    ));
