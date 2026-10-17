import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMtnMomoPaymentStatus } from "@/lib/payments/mtn-momo";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const statusRequestSchema = z.object({
  checkoutId: z.string().uuid(),
  reference: z.string().uuid(),
  guestAccessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
});
const paymentContextSchema = z.object({
  payment_id: z.string().uuid(),
  reference: z.string().uuid(),
  amount_pesewas: z.number().int().positive().safe(),
  status: z.enum(["pending", "processing", "paid", "failed", "cancelled", "refunded", "partially_refunded"]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = statusRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Payment status request is invalid." }, { status: 400 });

  const auth = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError) return NextResponse.json({ error: "The current sign-in state could not be verified." }, { status: 401 });
  const limit = await checkRateLimit(request, "payment:momo-status", 24, 60, user?.id);
  if (!limit.configured) return NextResponse.json({ error: "Payment protection is not configured." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many payment status checks. Try again shortly." }, { status: 429 });
  if (!user && !parsed.data.guestAccessToken) return NextResponse.json({ error: "Order access is required." }, { status: 401 });

  const guestHash = parsed.data.guestAccessToken
    ? createHash("sha256").update(parsed.data.guestAccessToken).digest("hex")
    : null;
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("get_mtn_momo_payment_context", {
    p_checkout_id: parsed.data.checkoutId,
    p_buyer_user_id: user?.id ?? null,
    p_guest_token_hash: guestHash,
    p_provider_reference: parsed.data.reference,
  });
  if (error) return NextResponse.json({ error: "Payment access is invalid or has expired." }, { status: 404 });
  const parsedContext = paymentContextSchema.safeParse(data);
  if (!parsedContext.success) {
    return NextResponse.json({ error: "Payment status returned an invalid result." }, { status: 502 });
  }
  const payment = parsedContext.data;
  if (payment.status === "paid" || payment.status === "failed") {
    return NextResponse.json({ status: payment.status }, { headers: { "Cache-Control": "no-store" } });
  }
  if (payment.status !== "pending" && payment.status !== "processing") {
    return NextResponse.json({ status: payment.status }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const verified = await getMtnMomoPaymentStatus(payment.reference, payment.amount_pesewas);
    if (verified.status === "pending") {
      return NextResponse.json({ status: "pending" }, { headers: { "Cache-Control": "no-store" } });
    }
    const { error: applyError } = await service.rpc("apply_mtn_momo_payment_status", {
      p_provider_event_id: `${payment.reference}:${verified.status}`,
      p_provider_reference: payment.reference,
      p_verified_status: verified.status,
      p_amount_pesewas: verified.amountPesewas,
      p_provider_transaction_id: verified.providerTransactionId,
      p_redacted_event: { reference: payment.reference, status: verified.status },
    });
    if (applyError) {
      console.error("Verified MTN MoMo payment status could not be recorded.", applyError.code);
      return NextResponse.json({ error: "Verified payment status could not be recorded." }, { status: 503 });
    }
    return NextResponse.json({ status: verified.status }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "MTN MoMo could not verify the payment status. Try again shortly." }, { status: 503 });
  }
}
