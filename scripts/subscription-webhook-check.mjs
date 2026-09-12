import assert from "node:assert/strict";

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

const buildAutoRecurring = (hasUsedTrial) => ({
  frequency: 1,
  frequency_type: "months",
  transaction_amount: 10,
  currency_id: "BRL",
  ...(hasUsedTrial ? {} : { free_trial: { frequency: 7, frequency_type: "days" } }),
});

const reference = "signals:123e4567-e89b-12d3-a456-426614174000:7ef3c1d4-6d6e-4cb4-bd7b-1a6d98b20f13";
assert.equal(map("pending"), "incomplete");
assert.equal(map("authorized"), "active");
assert.equal(map("paused"), "paused");
assert.equal(map("canceled"), "canceled");
assert.equal(map("recycling"), "past_due");
assert.match(reference, /^signals:[0-9a-f-]{36}:[0-9a-f-]{36}$/i);
assert.doesNotMatch("signals:not-a-user:random", /^signals:[0-9a-f-]{36}:[0-9a-f-]{36}$/i);
assert.deepEqual(buildAutoRecurring(false).free_trial, { frequency: 7, frequency_type: "days" });
assert.equal("free_trial" in buildAutoRecurring(true), false);
assert.equal(map("expired"), "expired");
console.log("subscription webhook checks passed");
