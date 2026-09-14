import { json, options } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { buildPaidAutoRecurring, getSubscriptionPeriod, mapMercadoPagoStatus } from "../_shared/subscription.ts";

const PRICE = 10;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return options();
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const user = await requireUser(request);
    const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
    const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "");
    if (!accessToken || !siteUrl) return json({ error: "payment_not_configured" }, 503);
    const body = await request.json().catch(() => ({}));
    if (body.plan !== "pro_monthly") return json({ error: "invalid_plan" }, 400);

    const supabase = adminClient();
    const { data: plan, error: planError } = await supabase.from("plans").select("id").eq("code", "pro_monthly").eq("is_active", true).single();
    if (planError || !plan) return json({ error: "plan_not_found" }, 500);

    const { data: existing } = await supabase.from("subscriptions").select("provider_subscription_id").eq("user_id", user.id).in("status", ["incomplete", "trialing", "active", "past_due", "paused"]).not("provider_subscription_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing?.provider_subscription_id) {
      const current = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(existing.provider_subscription_id)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const currentData = await current.json();
      if (current.ok && currentData.init_point) return json({ init_point: currentData.init_point, preapproval_id: currentData.id, existing: true });
    }

    const { data: trial, error: trialError } = await supabase.from("trials").select("id").eq("user_id", user.id).maybeSingle();
    if (trialError) return json({ error: "database_error" }, 500);
    // The local trial is intentionally only observed here. It never changes the paid payload.
    void trial;

    const externalReference = `signals:${user.id}:${crypto.randomUUID()}`;
    const requestPayload = {
      reason: "Signals Pro",
      external_reference: externalReference,
      payer_email: user.email,
      auto_recurring: buildPaidAutoRecurring(),
      back_url: `${siteUrl}/checkout/success`,
    };
    const response = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
    const subscription = await response.json();
    if (!response.ok || !subscription.id || !subscription.init_point) {
      return json({ error: "provider_error" }, 502);
    }

    const period = getSubscriptionPeriod(subscription);
    const { error: localError } = await supabase.from("subscriptions").insert({ user_id: user.id, plan_id: plan.id, provider: "mercadopago", provider_subscription_id: String(subscription.id), status: mapMercadoPagoStatus(String(subscription.status ?? "pending")), ...period });
    if (localError?.code === "23505") return json({ error: "subscription_already_exists" }, 409);
    if (localError) return json({ error: "database_error" }, 500);
    return json({ init_point: subscription.init_point, preapproval_id: subscription.id });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    return json({ error: code.startsWith("AUTH_") ? "unauthorized" : "internal_error" }, code.startsWith("AUTH_") ? 401 : 500);
  }
});
