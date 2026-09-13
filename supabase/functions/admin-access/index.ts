import { json, options } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

type UserSummary = { id: string; email: string | null };

async function requireAdmin(userId: string) {
  const supabase = adminClient();
  const { data, error } = await supabase.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("database_error");
  if (!data) throw new Error("ADMIN_REQUIRED");
  return supabase;
}

async function findUser(supabase: ReturnType<typeof adminClient>, userId?: unknown, email?: unknown): Promise<UserSummary | null> {
  if (typeof userId === "string" && userId.trim()) {
    const { data, error } = await supabase.auth.admin.getUserById(userId.trim());
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  }
  if (typeof email !== "string" || !email.trim()) return null;
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("user_lookup_failed");
    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === target);
    if (match) return { id: match.id, email: match.email ?? null };
    if (data.users.length < 1000) break;
  }
  return null;
}

function parseEndDate(body: Record<string, unknown>, startsAt: Date) {
  const hasDuration = body.duration_days !== undefined;
  const hasEnd = body.ends_at !== undefined;
  if (hasDuration === hasEnd) throw new Error("provide_duration_or_ends_at");
  if (hasDuration) {
    const days = Number(body.duration_days);
    if (!Number.isInteger(days) || days <= 0 || days > 3650) throw new Error("invalid_duration");
    return new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
  }
  if (typeof body.ends_at !== "string") throw new Error("invalid_ends_at");
  const endsAt = new Date(body.ends_at);
  if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error("invalid_ends_at");
  return endsAt;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return options();
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const actor = await requireUser(request);
    const supabase = await requireAdmin(actor.id);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "me") return json({ admin: true });

    if (action === "find_user") {
      const user = await findUser(supabase, body.user_id, body.email);
      return user ? json({ user }) : json({ error: "user_not_found" }, 404);
    }

    const target = await findUser(supabase, body.user_id, body.email);
    if (!target) return json({ error: "user_not_found" }, 404);

    if (action === "list") {
      const { data: grants, error } = await supabase.from("admin_access_grants").select("id, user_id, starts_at, ends_at, reason, created_by, created_at, revoked_at").eq("user_id", target.id).order("created_at", { ascending: false });
      if (error) return json({ error: "database_error" }, 500);
      return json({ user: target, grants: grants ?? [] });
    }

    if (action === "grant") {
      const startsAt = new Date();
      const endsAt = parseEndDate(body, startsAt);
      const reason = body.reason === undefined || body.reason === null ? null : String(body.reason).trim();
      if (reason && reason.length > 500) return json({ error: "reason_too_long" }, 400);
      const { data: grant, error } = await supabase.from("admin_access_grants").insert({ user_id: target.id, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), reason, created_by: actor.id }).select("id, user_id, starts_at, ends_at, reason, created_by, created_at, revoked_at").single();
      if (error) return json({ error: "database_error" }, 500);
      return json({ user: target, grant }, 201);
    }

    if (action === "revoke") {
      if (typeof body.grant_id !== "string" || !body.grant_id.trim()) return json({ error: "grant_id_required" }, 400);
      const { data: grant, error } = await supabase.from("admin_access_grants").update({ revoked_at: new Date().toISOString() }).eq("id", body.grant_id.trim()).eq("user_id", target.id).is("revoked_at", null).select("id, user_id, starts_at, ends_at, reason, created_by, created_at, revoked_at").maybeSingle();
      if (error) return json({ error: "database_error" }, 500);
      if (!grant) return json({ error: "grant_not_found" }, 404);
      return json({ user: target, grant });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    if (code === "ADMIN_REQUIRED") return json({ error: "forbidden" }, 403);
    if (code === "AUTH_REQUIRED" || code === "AUTH_INVALID") return json({ error: "unauthorized" }, 401);
    if (["provide_duration_or_ends_at", "invalid_duration", "invalid_ends_at", "user_lookup_failed"].includes(code)) return json({ error: code }, 400);
    return json({ error: code === "database_error" ? code : "internal_error" }, code === "database_error" ? 500 : 500);
  }
});
