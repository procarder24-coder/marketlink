import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationError, requireSignedInUser } from "@/lib/authz";
import { checkRateLimit } from "@/lib/rate-limit";

const consentSchema = z.object({
  applicationId: z.string().uuid(),
  consent: z.literal(true),
  policyVersion: z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = consentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Explicit identity-verification consent is required." }, { status: 400 });

  try {
    const { supabase, user } = await requireSignedInUser();
    const limit = await checkRateLimit(request, "vendor:kyc-consent", 8, 3600, user.id);
    if (!limit.configured) return NextResponse.json({ error: "Consent recording is not configured." }, { status: 503 });
    if (!limit.allowed) return NextResponse.json({ error: "Too many consent attempts. Try again later." }, { status: 429 });
    const { data, error } = await supabase.rpc("record_kyc_consent", {
      p_application_id: parsed.data.applicationId,
      p_policy_version: parsed.data.policyVersion,
    });
    if (error) return NextResponse.json({ error: "Consent could not be recorded for this application." }, { status: 409 });
    return NextResponse.json({ consent: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Consent recording is unavailable." }, { status: 503 });
  }
}
