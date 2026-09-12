import { json, options } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

const TRIAL_DAYS = 7;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return options();
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await requireUser(request);
    const supabase = adminClient();
    const { data: existing, error: lookupError } = await supabase.from("trials").select("id, starts_at, ends_at, status").eq("user_id", user.id).maybeSingle();
    if (lookupError) return json({ error: "database_error", message: lookupError.message }, 500);
    if (existing) return json({ trial: existing, created: false });

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const { data: trial, error } = await supabase.from("trials").insert({ user_id: user.id, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), status: "active" }).select("id, starts_at, ends_at, status").single();
    if (error) return json({ error: error.code === "23505" ? "trial_already_started" : "database_error" }, error.code === "23505" ? 409 : 500);
    return json({ trial, created: true }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    return json({ error: code === "AUTH_REQUIRED" || code === "AUTH_INVALID" ? "unauthorized" : "internal_error" }, code.startsWith("AUTH_") ? 401 : 500);
  }
});
