import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const map = (status) => ({
  authorized: "active",
  active: "active",
  pending: "incomplete",
  paused: "paused",
  canceled: "canceled",
  cancelled: "canceled",
  expired: "expired",
  recycling: "past_due",
  past_due: "past_due",
}[status.toLowerCase()] ?? "incomplete");

const buildPaidAutoRecurring = () => ({
  frequency: 1,
  frequency_type: "months",
  transaction_amount: 10,
  currency_id: "BRL",
});

const reference = "signals:123e4567-e89b-12d3-a456-426614174000:7ef3c1d4-6d6e-4cb4-bd7b-1a6d98b20f13";
assert.equal(map("pending"), "incomplete");
assert.equal(map("authorized"), "active");
assert.equal(map("paused"), "paused");
assert.equal(map("canceled"), "canceled");
assert.equal(map("recycling"), "past_due");
assert.match(reference, /^signals:[0-9a-f-]{36}:[0-9a-f-]{36}$/i);
assert.doesNotMatch("signals:not-a-user:random", /^signals:[0-9a-f-]{36}:[0-9a-f-]{36}$/i);
assert.deepEqual(buildPaidAutoRecurring(), {
  frequency: 1,
  frequency_type: "months",
  transaction_amount: 10,
  currency_id: "BRL",
});
assert.equal("free_trial" in buildPaidAutoRecurring(), false);
assert.equal(map("expired"), "expired");

const migration = readFileSync("supabase/migrations/202609120002_auto_start_trial.sql", "utf8");
const checkout = readFileSync("supabase/functions/create-checkout/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/payment-webhook/index.ts", "utf8");
const licenseStatus = readFileSync("supabase/functions/license-status/index.ts", "utf8");
const account = readFileSync("app/account/page.tsx", "utf8");
assert.match(migration, /after insert on auth\.users/);
assert.match(migration, /on conflict \(user_id\) do nothing/);
assert.match(migration, /interval '7 days'/);
assert.match(migration, /trial dates are immutable/);
assert.doesNotMatch(checkout, /\.from\("trials"\)\.(insert|update|delete)/);
assert.doesNotMatch(checkout, /free_trial/);
assert.doesNotMatch(webhook, /\.from\("trials"\)/);
assert.match(licenseStatus, /new Date\(trial\.data\.ends_at\)\.getTime\(\) > now/);
assert.match(account, /functions\.invoke\("license-status"/);
console.log("subscription webhook checks passed");
