export type LocalSubscriptionStatus = "trialing" | "active" | "past_due" | "paused" | "canceled" | "expired" | "incomplete";

export function mapMercadoPagoStatus(status: string): LocalSubscriptionStatus {
  switch (status.toLowerCase()) {
    case "authorized":
    case "active": return "active";
    case "pending": return "incomplete";
    case "paused": return "paused";
    case "canceled":
    case "cancelled": return "canceled";
    case "expired": return "expired";
    case "recycling":
    case "past_due": return "past_due";
    default: return "incomplete";
  }
}

export function userIdFromExternalReference(reference: unknown): string | null {
  if (typeof reference !== "string") return null;
  const match = reference.match(/^signals:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match?.[1] ?? null;
}

export function trialEndsAt(subscription: Record<string, unknown>, fallbackStart: Date): Date | null {
  const recurring = (subscription.auto_recurring ?? {}) as Record<string, unknown>;
  const freeTrial = (recurring.free_trial ?? {}) as Record<string, unknown>;
  const offset = Number(subscription.first_invoice_offset ?? freeTrial.frequency ?? 0);
  if (!Number.isFinite(offset) || offset <= 0) return null;
  const start = new Date(String(recurring.start_date ?? subscription.date_created ?? fallbackStart.toISOString()));
  if (Number.isNaN(start.getTime())) return null;
  const days = String(freeTrial.frequency_type ?? "days") === "months" ? offset * 30 : offset;
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

export function buildAutoRecurring(hasUsedTrial: boolean) {
  const recurring = { frequency: 1, frequency_type: "months", transaction_amount: 10, currency_id: "BRL" } as Record<string, unknown>;
  if (!hasUsedTrial) recurring.free_trial = { frequency: 7, frequency_type: "days" };
  return recurring;
}
