import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requestMtnMomoPayment } from "@/lib/payments/mtn-momo";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const paymentSchema = z.object({
  checkoutId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  guestAccessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
});
const preparedPaymentSchema = z.object({
  payment_id: z.string().uuid(),
  reference: z.string().uuid(),
  amount_pesewas: z.number().int().positive().safe(),
  phone: z.string().min(9).max(30),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Payment request is invalid." }, { status: 400 });

  const auth = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError) return NextResponse.json({ error: "The current sign-in state could not be verified." }, { status: 401 });
  const limit = await checkRateLimit(request, "payment:initialize", 8, 60, user?.id);
  if (!limit.configured) return NextResponse.json({ error: "Payment protection is not configured." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many payment attempts. Try again shortly." }, { status: 429 });
  if (!user && !parsed.data.guestAccessToken) return NextResponse.json({ error: "Order access is required." }, { status: 401 });

  const guestHash = parsed.data.guestAccessToken
    ? createHash("sha256").update(parsed.data.guestAccessToken).digest("hex")
    : null;
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("prepare_mtn_momo_payment", {
    p_checkout_id: parsed.data.checkoutId,
    p_buyer_user_id: user?.id ?? null,
    p_guest_token_hash: guestHash,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    console.error("MTN MoMo payment preparation failed.", error.code);
    return NextResponse.json({ error: "Payment could not be prepared for this order." }, { status: 409 });
  }

  const parsedPayment = preparedPaymentSchema.safeParse(data);
  if (!parsedPayment.success) {
    return NextResponse.json({ error: "Payment preparation returned an invalid result." }, { status: 502 });
  }
  const payment = parsedPayment.data;
  try {
    await requestMtnMomoPayment({
      reference: payment.reference,
      amountPesewas: payment.amount_pesewas,
      phone: payment.phone,
    });
    const { error: updateError } = await service.rpc("mark_mtn_momo_payment_initialized", {
      p_payment_id: payment.payment_id,
      p_provider_reference: payment.reference,
    });
    if (updateError) {
      console.error("MTN MoMo payment initialization could not be recorded.", updateError.code);
      return NextResponse.json({
        error: "MTN MoMo accepted the request, but its status could not be recorded. Do not start another payment; contact support.",
      }, { status: 502 });
    }
    return NextResponse.json({
      reference: payment.reference,
      status: "pending",
      message: "Approve the payment prompt on your MTN MoMo phone. Payment is not confirmed yet.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      error: "MTN MoMo could not start this sandbox payment. No payment has been confirmed.",
    }, { status: 503 });
  }
}
