-- Repair profile creation globally without rewriting migration history.
-- 202609120002 exists twice locally; the already-applied history is left intact.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_username text := lower(btrim(coalesce(new.raw_user_meta_data->>'username', '')));
  requested_name text := btrim(coalesce(new.raw_user_meta_data->>'display_name', ''));
  candidate_username text;
  fallback_attempt integer := 0;
begin
  requested_name := coalesce(
    nullif(requested_name, ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'name', '')), ''),
    nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'Signals user'
  );

  if requested_username ~ '^[a-z0-9._]{3,20}$' then
    begin
      insert into public.profiles (id, email, username, display_name)
      values (new.id, new.email, requested_username, requested_name)
      on conflict (id) do nothing;
      return new;
    exception
      when unique_violation then
        -- An occupied explicit username must not block Auth user creation.
        null;
    end;
  end if;

  loop
    fallback_attempt := fallback_attempt + 1;
    candidate_username := 'user_' || left(md5(new.id::text || ':' || fallback_attempt::text), 15);
    begin
      insert into public.profiles (id, email, username, display_name)
      values (new.id, new.email, candidate_username, requested_name)
      on conflict (id) do nothing;
      exit;
    exception
      when unique_violation then
        -- Retry with another deterministic candidate in the rare hash collision case.
        null;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

do $$
declare
  auth_user auth.users%rowtype;
  requested_username text;
  requested_name text;
  candidate_username text;
  fallback_attempt integer;
begin
  for auth_user in
    select u.*
    from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    requested_username := lower(btrim(coalesce(auth_user.raw_user_meta_data->>'username', '')));
    requested_name := coalesce(
      nullif(btrim(coalesce(auth_user.raw_user_meta_data->>'display_name', '')), ''),
      nullif(btrim(coalesce(auth_user.raw_user_meta_data->>'full_name', '')), ''),
      nullif(btrim(coalesce(auth_user.raw_user_meta_data->>'name', '')), ''),
      nullif(btrim(split_part(coalesce(auth_user.email, ''), '@', 1)), ''),
      'Signals user'
    );

    if requested_username !~ '^[a-z0-9._]{3,20}$' then
      requested_username := null;
    end if;

    if requested_username is not null then
      begin
        insert into public.profiles (id, email, username, display_name)
        values (auth_user.id, auth_user.email, requested_username, requested_name)
        on conflict (id) do nothing;
      exception
        when unique_violation then
          requested_username := null;
      end;
    end if;

    if requested_username is null then
      fallback_attempt := 0;
      loop
        fallback_attempt := fallback_attempt + 1;
        candidate_username := 'user_' || left(md5(auth_user.id::text || ':' || fallback_attempt::text), 15);
        begin
          insert into public.profiles (id, email, username, display_name)
          values (auth_user.id, auth_user.email, candidate_username, requested_name)
          on conflict (id) do nothing;
          exit;
        exception
          when unique_violation then
            null;
        end;
      end loop;
    end if;
  end loop;
end;
$$;

update public.profiles as p
set username = lower(btrim(u.raw_user_meta_data->>'username'))
from auth.users as u
where p.id = u.id
  and left(lower(btrim(p.username)), 5) = 'user_'
  and lower(btrim(coalesce(u.raw_user_meta_data->>'username', ''))) ~ '^[a-z0-9._]{3,20}$'
  and lower(btrim(p.username)) <> lower(btrim(u.raw_user_meta_data->>'username'))
  and not exists (
    select 1
    from public.profiles as other
    where other.id <> p.id
      and lower(other.username) = lower(btrim(u.raw_user_meta_data->>'username'))
  );

update public.profiles as p
set display_name = btrim(u.raw_user_meta_data->>'display_name')
from auth.users as u
where p.id = u.id
  and nullif(btrim(p.display_name), '') is null
  and nullif(btrim(u.raw_user_meta_data->>'display_name'), '') is not null;
