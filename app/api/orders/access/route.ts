import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { checkRateLimit } from "@/lib/rate-limit";

const accessSchema = z.object({
  checkoutId: z.string().uuid(),
  guestAccessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = accessSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Order access details are invalid." }, { status: 400 });
  const limit = await checkRateLimit(request, "order:guest-access", 12, 60);
  if (!limit.configured) return NextResponse.json({ error: "Guest order access protection is not configured." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many access attempts. Try again shortly." }, { status: 429 });
  const tokenHash = createHash("sha256").update(parsed.data.guestAccessToken).digest("hex");
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("get_guest_order_status", {
    p_checkout_id: parsed.data.checkoutId,
    p_guest_token_hash: tokenHash,
  });
  if (error) return NextResponse.json({ error: "Order access is invalid or has expired." }, { status: 404 });
  return NextResponse.json({ order: data }, { headers: { "Cache-Control": "no-store" } });
}
