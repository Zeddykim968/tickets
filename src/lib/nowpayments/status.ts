import type { PaymentStatus } from "@/db/schema/nowpayments";

const webhookStatusMap: Record<string, PaymentStatus> = {
  waiting: "processing",
  confirming: "processing",
  confirmed: "processing",
  sending: "processing",
  finished: "paid",
  partially_paid: "under_review",
  failed: "failed",
  expired: "expired",
  refunded: "under_review",
};

const terminalStatuses = new Set<PaymentStatus>(["paid", "failed", "expired"]);

export function mapNowPaymentsStatus(status: string): PaymentStatus | null {
  return webhookStatusMap[status] ?? null;
}

export function canTransitionPayment(current: PaymentStatus, next: PaymentStatus): boolean {
  if (current === next || terminalStatuses.has(current)) return false;
  if (current !== "pending" && next === "pending") return false;
  if (current === "under_review" && next === "processing") return false;
  return true;
}
