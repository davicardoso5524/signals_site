-- Every auth user receives one immutable trial at account creation time.
create or replace function public.create_initial_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trial_start timestamptz := coalesce(new.created_at, now());
begin
  insert into public.trials (user_id, starts_at, ends_at, status)
  values (new.id, trial_start, trial_start + interval '7 days', 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_users_create_initial_trial on auth.users;
create trigger auth_users_create_initial_trial
after insert on auth.users
for each row execute function public.create_initial_trial();

create or replace function public.keep_trial_dates_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at then
    raise exception 'trial dates are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trials_keep_dates_immutable on public.trials;
create trigger trials_keep_dates_immutable
before update on public.trials
for each row execute function public.keep_trial_dates_immutable();
