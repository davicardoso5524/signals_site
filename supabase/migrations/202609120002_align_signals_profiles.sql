-- Align the destination project's profile table with the existing Signals app.
-- This is intentionally additive so existing site rows are preserved.

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;

update public.profiles
set
  display_name = coalesce(nullif(btrim(display_name), ''), nullif(split_part(email, '@', 1), ''), 'Signals user'),
  username = coalesce(nullif(username, ''), 'user_' || replace(left(id::text, 8), '-', ''))
where username is null or username = '' or display_name is null or btrim(display_name) = '';

alter table public.profiles alter column username set not null;
alter table public.profiles alter column display_name set not null;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_username_format
      check (username ~ '^[a-z0-9._]{3,20}$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_display_name_not_blank'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_display_name_not_blank
      check (length(btrim(display_name)) > 0);
  end if;
end;
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  requested_username text := lower(btrim(coalesce(new.raw_user_meta_data->>'username', '')));
  requested_name text := btrim(coalesce(new.raw_user_meta_data->>'display_name', ''));
begin
  if requested_username !~ '^[a-z0-9._]{3,20}$' or requested_name = '' then
    raise exception 'Invalid public profile data';
  end if;
  insert into public.profiles (id, email, username, display_name)
  values (new.id, new.email, requested_username, requested_name)
  on conflict (id) do update set
    email = excluded.email,
    username = excluded.username,
    display_name = excluded.display_name;
  return new;
end;
$$;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists "Authenticated users can read public profiles" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
