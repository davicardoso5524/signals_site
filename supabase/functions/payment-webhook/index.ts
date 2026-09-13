import { json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { mapMercadoPagoStatus, userIdFromExternalReference } from "../_shared/subscription.ts";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateSignature(request: Request, resourceId: string, secret: string) {
  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
  if (!parts.v1 || !parts.ts || !requestId) return false;
  const template = `id:${resourceId};request-id:${requestId};ts:${parts.ts};`;
  return (await hmac(secret, template)) === parts.v1;
}

async function recordEvent(providerEventId: string, eventType: string, payload: unknown) {
  const supabase = adminClient();
  const { data: existing, error: lookupError } = await supabase.from("payment_events").select("id, processed_at").eq("provider_event_id", providerEventId).maybeSingle();
  if (lookupError) throw new Error("database_error");
  if (existing?.processed_at) return { supabase, duplicate: true };
  if (!existing) {
    const { error } = await supabase.from("payment_events").insert({ provider: "mercadopago", provider_event_id: providerEventId, event_type: eventType, payload });
    if (error?.code === "23505") return { supabase, duplicate: true };
    if (error) throw new Error("database_error");
  }
  return { supabase, duplicate: false };
}

async function handlePaymentEvent(payload: Record<string, unknown>, accessToken: string, webhookSecret: string) {
  const paymentId = String((payload.data as Record<string, unknown>)?.id ?? "");
  if (!paymentId) return json({ error: "missing_resource_id" }, 400);
  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (paymentResponse.status === 404) return json({ ok: true, ignored: "payment_not_found" });
  if (!paymentResponse.ok) return json({ error: "provider_error" }, 502);
  const payment = await paymentResponse.json();
  const [userId] = String(payment.external_reference ?? "").split(":");
  if (payment.status !== "approved" || Number(payment.transaction_amount) !== 10 || !/^[0-9a-f-]{36}$/i.test(userId)) return json({ ok: true, ignored: "payment_not_eligible" });
  const eventId = `payment:${paymentId}:${String(payload.id ?? "resource")}`;
  const { supabase, duplicate } = await recordEvent(eventId, "payment.approved", payment);
  if (duplicate) return json({ ok: true, duplicate: true });
  const { data: plan } = await supabase.from("plans").select("id").eq("code", "pro_monthly").single();
  if (!plan) return json({ error: "plan_not_found" }, 500);
  const key = `SIG-${(await hmac(webhookSecret, `license:${paymentId}:${userId}`)).slice(0, 20).toUpperCase()}`;
  const { error: keyError } = await supabase.from("license_keys").insert({ key_hash: await sha256(key), key_prefix: key.slice(0, 8), issued_to_user_id: userId, plan_id: plan.id, duration_days: 30, max_activations: 1, delivery_status: "pending" });
  if (keyError && keyError.code !== "23505") return json({ error: "database_error" }, 500);
  await supabase.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("provider_event_id", eventId);
  return json({ ok: true });
}

async function handleSubscriptionPreapprovalEvent(payload: Record<string, unknown>, accessToken: string) {
  const preapprovalId = String((payload.data as Record<string, unknown>)?.id ?? "");
  if (!preapprovalId) return json({ error: "missing_resource_id" }, 400);
  const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 404) return json({ ok: true, ignored: "preapproval_not_found" });
  if (!response.ok) return json({ error: "provider_error" }, 502);
  const subscription = await response.json() as Record<string, unknown>;
  const eventId = `subscription:${preapprovalId}:${String(payload.id ?? subscription.version ?? "event")}`;
  const { supabase, duplicate } = await recordEvent(eventId, "subscription_preapproval.updated", subscription);
  if (duplicate) return json({ ok: true, duplicate: true });
  const status = mapMercadoPagoStatus(String(subscription.status ?? ""));
  const userId = userIdFromExternalReference(subscription.external_reference);
  const { data: existing } = await supabase.from("subscriptions").select("user_id, plan_id").eq("provider_subscription_id", preapprovalId).maybeSingle();
  const resolvedUserId = userId ?? existing?.user_id;
  if (!resolvedUserId) return json({ error: "subscription_user_not_found" }, 422);
  const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserById(resolvedUserId);
  if (authUserError || !authUser.user) return json({ error: "subscription_user_not_found" }, 422);
  const { data: plan } = await supabase.from("plans").select("id").eq("code", "pro_monthly").single();
  if (!plan) return json({ error: "plan_not_found" }, 500);
  const recurring = (subscription.auto_recurring ?? {}) as Record<string, unknown>;
  const start = new Date(String(recurring.start_date ?? subscription.date_created ?? new Date().toISOString()));
  const periodEndValue = subscription.next_payment_date ?? recurring.end_date ?? null;
  const { error: subscriptionError } = await supabase.from("subscriptions").upsert({ user_id: resolvedUserId, plan_id: plan.id, provider: "mercadopago", provider_subscription_id: preapprovalId, status, current_period_start: Number.isNaN(start.getTime()) ? null : start.toISOString(), current_period_end: periodEndValue }, { onConflict: "provider_subscription_id" });
  if (subscriptionError) return json({ error: "database_error" }, 500);
  await supabase.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("provider_event_id", eventId);
  return json({ ok: true, status });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: true });
  const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
  const webhookSecret = Deno.env.get("MP_WEBHOOK_SECRET");
  if (!accessToken || !webhookSecret) return json({ error: "webhook_not_configured" }, 503);
  try {
    const payload = await request.json() as Record<string, unknown>;
    const type = String(payload.type ?? "");
    if (type !== "payment" && type !== "subscription_preapproval") return json({ ok: true, ignored: "unsupported_event" });
    const resourceId = String((payload.data as Record<string, unknown>)?.id ?? "");
    if (!resourceId) return json({ error: "missing_resource_id" }, 400);
    if (!(await validateSignature(request, resourceId, webhookSecret))) return json({ error: "invalid_signature" }, 401);
    if (type === "payment") return await handlePaymentEvent(payload, accessToken, webhookSecret);
    return await handleSubscriptionPreapprovalEvent(payload, accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return json({ error: message === "database_error" ? message : "invalid_webhook" }, message === "database_error" ? 500 : 400);
  }
});
