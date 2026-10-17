import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationError, requireAdministrator } from "@/lib/authz";
import { checkRateLimit } from "@/lib/rate-limit";

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "request_information", "manual_review"]),
  reason: z.string().trim().min(8).max(1000),
  vendorMessage: z.string().trim().max(1000).optional(),
}).superRefine((value, context) => {
  if ((value.decision === "rejected" || value.decision === "request_information")
    && (!value.vendorMessage || value.vendorMessage.length < 8)) {
    context.addIssue({ code: "custom", path: ["vendorMessage"], message: "Give the vendor clear next steps." });
  }
});

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A valid decision and review reason are required." }, { status: 400 });
  const { applicationId } = await context.params;
  if (!z.string().uuid().safeParse(applicationId).success) return NextResponse.json({ error: "Invalid application reference." }, { status: 400 });

  try {
    const { supabase, user } = await requireAdministrator();
    const limit = await checkRateLimit(request, "admin:vendor-decision", 20, 60, user.id);
    if (!limit.configured) return NextResponse.json({ error: "Administrator action protection is not configured." }, { status: 503 });
    if (!limit.allowed) return NextResponse.json({ error: "Too many administrative decisions. Try again shortly." }, { status: 429 });
    const { data, error } = await supabase.rpc("admin_review_vendor_application", {
      p_application_id: applicationId,
      p_decision: parsed.data.decision,
      p_reason: parsed.data.reason,
      p_vendor_message: parsed.data.vendorMessage ?? null,
      p_reviewer_id: user.id,
    });
    if (error) return NextResponse.json({ error: "The verification decision could not be recorded." }, { status: 409 });
    return NextResponse.json({ result: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The administrative action could not be completed." }, { status: 500 });
  }
}
