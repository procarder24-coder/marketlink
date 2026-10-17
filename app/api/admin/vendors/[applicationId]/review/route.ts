import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationError, requireAdministrator } from "@/lib/authz";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await context.params;
  if (!z.string().uuid().safeParse(applicationId).success) {
    return NextResponse.json({ error: "Invalid application reference." }, { status: 400 });
  }
  try {
    const { supabase, user } = await requireAdministrator();
    const limit = await checkRateLimit(request, "admin:vendor-review-start", 20, 60, user.id);
    if (!limit.configured) {
      return NextResponse.json({ error: "Administrator action protection is not configured." }, { status: 503 });
    }
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many review actions. Try again shortly." }, { status: 429 });
    }
    const { data, error } = await supabase.rpc("admin_start_vendor_review", {
      p_application_id: applicationId,
    });
    if (error) {
      console.error("Administrator vendor review could not be started.", error.code);
      return NextResponse.json({ error: "The application could not be moved into review." }, { status: 409 });
    }
    return NextResponse.json({ result: data }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Administrator vendor review authorization could not be verified.");
    return NextResponse.json({ error: "The review action could not be completed." }, { status: 500 });
  }
}
