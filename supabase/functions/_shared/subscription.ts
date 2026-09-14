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

export function getSubscriptionPeriod(subscription: Record<string, any>) {
  const recurring = (subscription.auto_recurring ?? {}) as Record<string, unknown>;
  const startValue = recurring.start_date ?? subscription.date_created ?? null;
  const endValue = subscription.next_payment_date ?? recurring.end_date ?? null;
  const start = startValue ? new Date(String(startValue)) : null;
  const end = endValue ? new Date(String(endValue)) : null;
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null;
  const validEnd = end && !Number.isNaN(end.getTime()) ? end : null;

  return {
    current_period_start: validStart?.toISOString() ?? null,
    current_period_end: validEnd && (!validStart || validEnd.getTime() > validStart.getTime()) ? validEnd.toISOString() : null,
  };
}
