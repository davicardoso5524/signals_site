import { json, options } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return options();
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await requireUser(request);
    const supabase = adminClient();
    const [licenses, trial, subscriptions, grants] = await Promise.all([
      supabase.from("licenses").select("id, license_type, status, starts_at, expires_at, metadata").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("trials").select("starts_at, ends_at, status").eq("user_id", user.id).maybeSingle(),
      supabase.from("subscriptions").select("id, plan_id, status, current_period_end, cancel_at_period_end").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("admin_access_grants").select("starts_at, ends_at").eq("user_id", user.id).is("revoked_at", null),
    ]);
    const failure = licenses.error || trial.error || subscriptions.error || grants.error;
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
    const activeGrants = (grants.data ?? []).filter((grant) => new Date(grant.starts_at).getTime() <= now && new Date(grant.ends_at).getTime() > now);
    const candidates = [
      ...activeLicenses.map((license) => ({ source: "license", expires_at: license.expires_at })),
      ...activeSubscriptions.map((subscription) => ({ source: "subscription", expires_at: subscription.current_period_end })),
      ...(activeTrial ? [{ source: "trial", expires_at: activeTrial.ends_at }] : []),
      ...activeGrants.map((grant) => ({ source: "admin", expires_at: grant.ends_at })),
    ];
    const priority = ["admin", "subscription", "license", "trial"];
    const effectiveSource = priority.find((source) => candidates.some((candidate) => candidate.source === source));
    const effective = effectiveSource
      ? candidates
        .filter((candidate) => candidate.source === effectiveSource)
        .reduce<{ source: string; expires_at: string | null } | null>((latest, candidate) => {
          if (!latest) return candidate;
          if (!latest.expires_at) return latest;
          if (!candidate.expires_at) return candidate;
          return new Date(candidate.expires_at).getTime() > new Date(latest.expires_at).getTime() ? candidate : latest;
        }, null)
      : null;
    return json({ active: candidates.length > 0, access_source: effective?.source ?? null, expires_at: effective?.expires_at ?? null, licenses: activeLicenses, trial: trial.data ?? null, active_trial: activeTrial, subscriptions: subscriptions.data ?? [] });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    return json({ error: code === "AUTH_REQUIRED" || code === "AUTH_INVALID" ? "unauthorized" : "internal_error" }, code.startsWith("AUTH_") ? 401 : 500);
  }
});
