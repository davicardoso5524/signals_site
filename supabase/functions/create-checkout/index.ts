import { json, options } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { buildAutoRecurring, mapMercadoPagoStatus, trialEndsAt } from "../_shared/subscription.ts";

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

    const { data: trial } = await supabase.from("trials").select("id, starts_at, ends_at, status").eq("user_id", user.id).maybeSingle();
    let claimedTrialId: string | null = null;
    if (!trial) {
      const provisionalStart = new Date();
      const provisionalEnd = new Date(provisionalStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const { data: claimedTrial, error: claimError } = await supabase.from("trials").insert({ user_id: user.id, starts_at: provisionalStart.toISOString(), ends_at: provisionalEnd.toISOString(), status: "active" }).select("id").single();
      if (!claimError) claimedTrialId = claimedTrial.id;
      else if (claimError.code !== "23505") return json({ error: "database_error" }, 500);
    }
    const hasUsedTrial = Boolean(trial) || !claimedTrialId;

    const externalReference = `signals:${user.id}:${crypto.randomUUID()}`;
    const response = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Signals Pro",
        external_reference: externalReference,
        payer_email: user.email,
        auto_recurring: buildAutoRecurring(hasUsedTrial),
        back_url: `${siteUrl}/checkout/success`,
        status: "pending",
      }),
    });
    const subscription = await response.json();
    if (!response.ok || !subscription.id || !subscription.init_point) {
      if (claimedTrialId) await supabase.from("trials").delete().eq("id", claimedTrialId);
      return json({ error: "provider_error" }, 502);
    }

    const start = new Date(String(subscription.auto_recurring?.start_date ?? subscription.date_created ?? new Date().toISOString()));
    const trialEnd = trialEndsAt(subscription, start);
    const recurring = (subscription.auto_recurring ?? {}) as Record<string, unknown>;
    const periodEnd = subscription.next_payment_date ?? recurring.end_date ?? null;
    const { error: localError } = await supabase.from("subscriptions").insert({ user_id: user.id, plan_id: plan.id, provider: "mercadopago", provider_subscription_id: String(subscription.id), status: mapMercadoPagoStatus(String(subscription.status ?? "pending")), current_period_start: Number.isNaN(start.getTime()) ? null : start.toISOString(), current_period_end: periodEnd });
    if (localError?.code === "23505") return json({ error: "subscription_already_exists" }, 409);
    if (localError) return json({ error: "database_error" }, 500);
    if (claimedTrialId && trialEnd) await supabase.from("trials").update({ starts_at: start.toISOString(), ends_at: trialEnd.toISOString(), status: "active" }).eq("id", claimedTrialId);
    return json({ init_point: subscription.init_point, preapproval_id: subscription.id });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    return json({ error: code.startsWith("AUTH_") ? "unauthorized" : "internal_error" }, code.startsWith("AUTH_") ? 401 : 500);
  }
});
