-- Signals billing and licensing foundation
-- Apply with Supabase migrations. Sensitive state is written by Edge Functions,
-- never directly by the public client.

create extension if not exists pgcrypto;

create type public.plan_billing_interval as enum ('monthly', 'yearly', 'lifetime');
create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'paused', 'canceled', 'expired',
  'incomplete', 'refunded', 'chargeback'
);
create type public.license_type as enum ('trial', 'subscription', 'key', 'lifetime');
create type public.license_status as enum ('active', 'expired', 'revoked', 'suspended');
create type public.trial_status as enum ('active', 'expired', 'revoked');
create type public.key_status as enum ('active', 'fully_redeemed', 'expired', 'revoked');

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  billing_interval public.plan_billing_interval not null,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'BRL' check (char_length(currency) = 3),
  provider_price_id text,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.trial_status not null default 'active',
  created_at timestamptz not null default now(),
  constraint trials_dates_valid check (ends_at > starts_at)
);

create table public.payment_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null,
  provider_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  provider text,
  provider_customer_id text,
  provider_subscription_id text unique,
  status public.subscription_status not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_valid check (
    current_period_end is null or current_period_start is null or current_period_end > current_period_start
  )
);

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  license_key_id uuid,
  license_type public.license_type not null,
  status public.license_status not null,
  starts_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint licenses_dates_valid check (expires_at is null or expires_at > starts_at)
);

create table public.license_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  key_prefix text not null,
  issued_to_user_id uuid references auth.users(id) on delete set null,
  source_subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid references public.plans(id),
  duration_days integer check (duration_days is null or duration_days > 0),
  max_activations integer not null default 1 check (max_activations > 0),
  activation_count integer not null default 0 check (activation_count >= 0 and activation_count <= max_activations),
  status public.key_status not null default 'active',
  expires_at timestamptz,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed')),
  delivered_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.license_key_redemptions (
  id uuid primary key default gen_random_uuid(),
  license_key_id uuid not null references public.license_keys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  license_id uuid not null references public.licenses(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (license_key_id, user_id)
);

alter table public.licenses
  add constraint licenses_key_fk
  foreign key (license_key_id) references public.license_keys(id) on delete set null;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null,
  device_name text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, device_hash)
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin', 'support')),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index subscriptions_user_status_idx on public.subscriptions (user_id, status);
create index licenses_user_status_idx on public.licenses (user_id, status);
create index licenses_expiry_idx on public.licenses (expires_at);
create index license_keys_issued_to_idx on public.license_keys (issued_to_user_id, created_at);
create index license_key_redemptions_user_idx on public.license_key_redemptions (user_id, redeemed_at);
create index payment_events_type_idx on public.payment_events (event_type, created_at);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger plans_set_updated_at before update on public.plans
for each row execute function public.set_updated_at();
create trigger payment_customers_set_updated_at before update on public.payment_customers
for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();
create trigger licenses_set_updated_at before update on public.licenses
for each row execute function public.set_updated_at();
create trigger license_keys_set_updated_at before update on public.license_keys
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$$;

alter table public.plans enable row level security;
alter table public.trials enable row level security;
alter table public.payment_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.licenses enable row level security;
alter table public.license_keys enable row level security;
alter table public.devices enable row level security;
alter table public.payment_events enable row level security;
alter table public.admin_users enable row level security;
alter table public.audit_logs enable row level security;

create policy plans_select_active on public.plans for select using (is_active = true or public.is_admin());
create policy plans_admin_write on public.plans for all using (public.is_admin()) with check (public.is_admin());

create policy trials_select_own on public.trials for select using (user_id = auth.uid() or public.is_admin());
create policy trials_admin_write on public.trials for all using (public.is_admin()) with check (public.is_admin());

create policy payment_customers_select_own on public.payment_customers for select using (user_id = auth.uid() or public.is_admin());
create policy payment_customers_admin_write on public.payment_customers for all using (public.is_admin()) with check (public.is_admin());

create policy subscriptions_select_own on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
create policy subscriptions_admin_write on public.subscriptions for all using (public.is_admin()) with check (public.is_admin());

create policy licenses_select_own on public.licenses for select using (user_id = auth.uid() or public.is_admin());
create policy licenses_admin_write on public.licenses for all using (public.is_admin()) with check (public.is_admin());

create policy license_keys_admin_only on public.license_keys for all using (public.is_admin()) with check (public.is_admin());
create policy license_keys_select_owner on public.license_keys for select using (issued_to_user_id = auth.uid());
create policy license_key_redemptions_select_own on public.license_key_redemptions for select using (user_id = auth.uid() or public.is_admin());
create policy license_key_redemptions_admin_write on public.license_key_redemptions for all using (public.is_admin()) with check (public.is_admin());
create policy devices_select_own on public.devices for select using (user_id = auth.uid() or public.is_admin());
create policy devices_admin_write on public.devices for all using (public.is_admin()) with check (public.is_admin());
create policy payment_events_admin_only on public.payment_events for select using (public.is_admin());
create policy admin_users_self_or_admin on public.admin_users for select using (user_id = auth.uid() or public.is_admin());
create policy admin_users_admin_write on public.admin_users for all using (public.is_admin()) with check (public.is_admin());
create policy audit_logs_admin_only on public.audit_logs for select using (public.is_admin());

-- Initial catalogue. Prices are placeholders and must be changed before checkout.
insert into public.plans (code, name, description, billing_interval, price_cents, currency, features, is_active)
values
  ('pro_monthly', 'Signals Pro Mensal', 'Acesso completo ao Signals.', 'monthly', 0, 'BRL', '{"advanced_signals": true, "export": true}'::jsonb, false),
  ('pro_yearly', 'Signals Pro Anual', 'Acesso completo ao Signals com cobrança anual.', 'yearly', 0, 'BRL', '{"advanced_signals": true, "export": true}'::jsonb, false)
on conflict (code) do nothing;
