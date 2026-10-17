export type PaymentState = "pending" | "processing" | "paid" | "failed" | "cancelled" | "refunded" | "partially_refunded";

const transitions: Record<PaymentState, readonly PaymentState[]> = {
  pending: ["processing", "paid", "failed", "cancelled"],
  processing: ["paid", "failed", "cancelled"],
  paid: ["refunded", "partially_refunded"],
  failed: ["processing", "paid"],
  cancelled: [],
  refunded: [],
  partially_refunded: ["refunded"],
};

export function canTransitionPayment(from: PaymentState, to: PaymentState) {
  return transitions[from].includes(to);
}

