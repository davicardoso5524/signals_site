update public.plans
set price_cents = 1000,
    is_active = true,
    updated_at = now()
where code = 'pro_monthly';
