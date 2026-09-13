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

export function buildPaidAutoRecurring() {
  return { frequency: 1, frequency_type: "months", transaction_amount: 10, currency_id: "BRL" };
}
