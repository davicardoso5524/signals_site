create table public.admin_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint admin_access_grants_dates_valid check (ends_at > starts_at)
);

create index admin_access_grants_user_dates_idx
  on public.admin_access_grants (user_id, starts_at, ends_at);

alter table public.admin_access_grants enable row level security;

create policy admin_access_grants_admin_select on public.admin_access_grants
  for select using (public.is_admin());
create policy admin_access_grants_admin_insert on public.admin_access_grants
  for insert with check (public.is_admin());
create policy admin_access_grants_admin_update on public.admin_access_grants
  for update using (public.is_admin()) with check (public.is_admin());
