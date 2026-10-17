import "server-only";

import { createHmac } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function checkRateLimit(request: Request, scope: string, maxRequests: number, windowSeconds: number, subject?: string) {
  const secret = process.env.RATE_LIMIT_HASH_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32
    || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { allowed: false, configured: false };
  }
  const forwardedIp = request.headers.get("x-real-ip")?.trim();
  if (!subject && !forwardedIp) return { allowed: false, configured: false };
  const identity = subject ?? forwardedIp!;
  const keyHash = createHmac("sha256", secret).update(identity).digest("hex");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc("consume_rate_limit", {
    p_key_hash: keyHash,
    p_scope: scope,
    p_window_started_at: new Date(windowStart * 1000).toISOString(),
    p_max_requests: maxRequests,
  });
  if (error || typeof data !== "boolean") {
    if (error) console.error("Rate-limit RPC failed.", error.code);
    return { allowed: false, configured: false };
  }
  return { allowed: data, configured: true };
}
