-- Only treat the normal first fallback candidate as system-generated.
-- A username such as user_alice is a legitimate user value and must not be
-- rewritten merely because it has the user_ prefix.

update public.profiles as p
set username = lower(btrim(u.raw_user_meta_data->>'username'))
from auth.users as u
where p.id = u.id
  and p.username = 'user_' || left(md5(p.id::text || ':1'), 15)
  and lower(btrim(coalesce(u.raw_user_meta_data->>'username', ''))) ~ '^[a-z0-9._]{3,20}$'
  and lower(btrim(p.username)) <> lower(btrim(u.raw_user_meta_data->>'username'))
  and not exists (
    select 1
    from public.profiles as other
    where other.id <> p.id
      and lower(other.username) = lower(btrim(u.raw_user_meta_data->>'username'))
  );
