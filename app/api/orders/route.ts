import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const checkoutSchema = z.object({
  idempotencyKey: z.string().uuid(),
  buyerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(9).max(30),
  deliveryAddress: z.string().trim().min(5).max(500),
  region: z.string().trim().min(2).max(80),
  guestAccessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(100),
  })).min(1).max(60),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Checkout details are invalid.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return NextResponse.json({ error: "The current sign-in state could not be verified." }, { status: 401 });
  const limit = await checkRateLimit(request, "checkout:create", user?.id ? 12 : 5, 60, user?.id);
  if (!limit.configured) return NextResponse.json({ error: "Checkout protection is not configured." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many checkout attempts. Try again shortly." }, { status: 429 });
  if (!user && !parsed.data.guestAccessToken) {
    return NextResponse.json({ error: "Generate a high-entropy guest access token before guest checkout." }, { status: 400 });
  }
  const tokenHash = parsed.data.guestAccessToken
    ? createHash("sha256").update(parsed.data.guestAccessToken).digest("hex")
    : null;
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("create_marketplace_order", {
    p_idempotency_key: parsed.data.idempotencyKey,
    p_buyer_user_id: user?.id ?? null,
    p_buyer_name: parsed.data.buyerName,
    p_buyer_email: parsed.data.email,
    p_buyer_phone: parsed.data.phone,
    p_delivery_address: parsed.data.deliveryAddress,
    p_delivery_region: parsed.data.region,
    p_items: parsed.data.items.map(({ productId, quantity }) => ({ product_id: productId, quantity })),
    p_guest_token_hash: user ? null : tokenHash,
  });
  if (error) {
    return NextResponse.json({ error: "The order could not be created. Check product availability and try again." }, { status: 409 });
  }
  const result = data as { checkout_id?: string; order_group_reference?: string } | null;
  if (!result?.checkout_id || !result.order_group_reference) {
    return NextResponse.json({ error: "Order creation returned an invalid result." }, { status: 502 });
  }
  return NextResponse.json({
    checkoutId: result.checkout_id,
    reference: result.order_group_reference,
    ...(user ? {} : { guestAccessToken: parsed.data.guestAccessToken, expiresInSeconds: 60 * 60 * 24 * 7 }),
    paymentStatus: "pending",
    message: "Order created. Payment has not been confirmed.",
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
