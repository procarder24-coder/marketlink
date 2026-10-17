import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationError, requireSignedInUser } from "@/lib/authz";
import { checkRateLimit } from "@/lib/rate-limit";

const vendorApplicationSchema = z.object({
  businessType: z.enum(["individual", "registered_business"]),
  businessName: z.string().trim().min(2).max(140),
  categoryId: z.string().uuid(),
  region: z.string().trim().min(2).max(80),
  location: z.string().trim().min(2).max(160),
  businessRole: z.string().trim().min(2).max(100),
  registrationNumber: z.string().trim().max(80).optional(),
  acceptedTerms: z.literal(true),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = vendorApplicationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Application details are invalid.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  if (parsed.data.businessType === "individual" && parsed.data.registrationNumber) {
    return NextResponse.json({ error: "Individual applications must not submit company registration details." }, { status: 400 });
  }

  try {
    const { supabase, user } = await requireSignedInUser();
    const limit = await checkRateLimit(request, "vendor:onboarding", 5, 3600, user.id);
    if (!limit.configured) return NextResponse.json({ error: "Onboarding protection is not configured." }, { status: 503 });
    if (!limit.allowed) return NextResponse.json({ error: "Too many applications. Try again later." }, { status: 429 });
    if (!user.email_confirmed_at) {
      return NextResponse.json({ error: "Verify your email before submitting a vendor application." }, { status: 403 });
    }
    const { data, error } = await supabase.rpc("submit_vendor_application", {
      p_business_type: parsed.data.businessType,
      p_business_name: parsed.data.businessName,
      p_category_id: parsed.data.categoryId,
      p_region: parsed.data.region,
      p_location: parsed.data.location,
      p_business_role: parsed.data.businessRole,
      p_registration_number: parsed.data.registrationNumber ?? null,
      p_terms_accepted: parsed.data.acceptedTerms,
    });
    if (error) return NextResponse.json({ error: "Vendor application could not be submitted." }, { status: 409 });
    return NextResponse.json({ application: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Vendor onboarding is not configured." }, { status: 503 });
  }
}
