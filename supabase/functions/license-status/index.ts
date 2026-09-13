import { json, options } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return options();
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await requireUser(request);
    const supabase = adminClient();
    const [licenses, trial, subscriptions] = await Promise.all([
      supabase.from("licenses").select("id, license_type, status, starts_at, expires_at, metadata").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("trials").select("starts_at, ends_at, status").eq("user_id", user.id).maybeSingle(),
      supabase.from("subscriptions").select("id, plan_id, status, current_period_end, cancel_at_period_end").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    const failure = licenses.error || trial.error || subscriptions.error;
    if (failure) return json({ error: "database_error", message: failure.message }, 500);

    const now = Date.now();
    const activeLicenses = (licenses.data ?? []).filter((license) =>
      license.status === "active" && (!license.expires_at || new Date(license.expires_at).getTime() > now)
    );
    const activeSubscriptions = (subscriptions.data ?? []).filter((subscription) =>
      ["active", "trialing"].includes(subscription.status) && (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > now)
    );
    const activeTrial = trial.data && trial.data.status === "active" && new Date(trial.data.ends_at).getTime() > now
      ? trial.data
      : null;
    return json({ active: activeLicenses.length > 0 || activeSubscriptions.length > 0 || Boolean(activeTrial), licenses: activeLicenses, trial: trial.data ?? null, active_trial: activeTrial, subscriptions: subscriptions.data ?? [] });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    return json({ error: code === "AUTH_REQUIRED" || code === "AUTH_INVALID" ? "unauthorized" : "internal_error" }, code.startsWith("AUTH_") ? 401 : 500);
  }
});
