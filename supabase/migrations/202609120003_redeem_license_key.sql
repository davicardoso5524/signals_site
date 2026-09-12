create or replace function public.redeem_license_key(p_user_id uuid, p_key_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  key_row public.license_keys%rowtype;
  license_id uuid;
  starts_at timestamptz := now();
  expires_at timestamptz;
begin
  select * into key_row
  from public.license_keys
  where key_hash = p_key_hash
  for update;

  if not found then raise exception 'key_not_found'; end if;
  if key_row.status <> 'active' or (key_row.expires_at is not null and key_row.expires_at <= now()) then
    raise exception 'key_unavailable';
  end if;
  if key_row.activation_count >= key_row.max_activations then raise exception 'key_fully_redeemed'; end if;
  if exists (select 1 from public.license_key_redemptions where license_key_id = key_row.id and user_id = p_user_id) then
    raise exception 'key_already_redeemed';
  end if;

  expires_at := case when key_row.duration_days is null then null else starts_at + make_interval(days => key_row.duration_days) end;
  insert into public.licenses (user_id, license_key_id, license_type, status, starts_at, expires_at, metadata)
  values (p_user_id, key_row.id, 'key', 'active', starts_at, expires_at, jsonb_build_object('key_prefix', key_row.key_prefix, 'plan_id', key_row.plan_id))
  returning id into license_id;

  insert into public.license_key_redemptions (license_key_id, user_id, license_id)
  values (key_row.id, p_user_id, license_id);
  update public.license_keys
  set activation_count = activation_count + 1,
      status = case when activation_count + 1 >= max_activations then 'fully_redeemed'::public.key_status else status end
  where id = key_row.id;
  return jsonb_build_object('license_id', license_id, 'key_prefix', key_row.key_prefix, 'expires_at', expires_at);
end;
$$;

revoke all on function public.redeem_license_key(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_license_key(uuid, text) to service_role;
