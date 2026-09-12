import { json, options } from "../_shared/cors.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return options();
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => ({}));
    if (typeof body.key !== "string" || body.key.trim().length < 8) return json({ error: "invalid_key" }, 400);
    const { data, error } = await adminClient().rpc("redeem_license_key", { p_user_id: user.id, p_key_hash: await sha256(body.key) });
    if (error) return json({ error: error.code === "P0001" ? error.message : "database_error" }, error.code === "P0001" ? 400 : 500);
    return json(data);
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    return json({ error: code === "AUTH_REQUIRED" || code === "AUTH_INVALID" ? "unauthorized" : "internal_error" }, code.startsWith("AUTH_") ? 401 : 500);
  }
});
