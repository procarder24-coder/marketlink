import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationError, requireAdministrator } from "@/lib/authz";
import { checkRateLimit } from "@/lib/rate-limit";

const vendorApplicationsSchema = z.array(z.object({
  id: z.string().uuid(),
  business_type: z.enum(["individual", "registered_business"]),
  business_name: z.string(),
  categories: z.object({ name: z.string() }).nullable(),
  region: z.string(),
  location: z.string(),
  business_role: z.string(),
  application_status: z.enum(["draft", "submitted", "under_review", "approved", "rejected", "needs_information"]),
  verification_status: z.enum(["submitted", "awaiting_verification", "processing", "needs_additional_information", "manual_review_required", "approved", "rejected"]),
  action_required_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}));

export async function GET(request: Request) {
  const pageParam = new URL(request.url).searchParams.get("page") ?? "1";
  const parsedPage = z.coerce.number().int().min(1).max(1_000_000).safeParse(pageParam);
  if (!parsedPage.success) {
    return NextResponse.json({ error: "Invalid vendor queue page." }, { status: 400 });
  }
  const pageSize = 50;
  const page = parsedPage.data;
  try {
    const { supabase, user } = await requireAdministrator();
    const limit = await checkRateLimit(request, "admin:vendor-queue", 60, 60, user.id);
    if (!limit.configured) {
      return NextResponse.json({ error: "Administrator request protection is not configured." }, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many vendor queue requests. Try again shortly." }, {
        status: 429,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const { data, count, error } = await supabase
      .from("vendor_applications")
      .select("id,business_type,business_name,categories(name),region,location,business_role,application_status,verification_status,action_required_message,created_at,updated_at", { count: "exact" })
      .in("application_status", ["submitted", "under_review", "needs_information"])
      .order("created_at", { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) {
      console.error("Administrator vendor queue could not be loaded.", error.code);
      return NextResponse.json({ error: "Vendor applications could not be loaded." }, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const parsed = vendorApplicationsSchema.safeParse(data);
    if (!parsed.success) {
      console.error("Administrator vendor queue returned invalid data.");
      return NextResponse.json({ error: "Vendor application data is invalid." }, {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ applications: parsed.data, total: count ?? 0, page }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Administrator vendor queue authorization could not be verified.");
    return NextResponse.json({ error: "Administrator access could not be verified." }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
