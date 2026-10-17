import { NextResponse } from "next/server";
import { AuthorizationError, getAdministratorAccess } from "@/lib/authz";

export async function GET() {
  let access: Awaited<ReturnType<typeof getAdministratorAccess>>;
  try {
    access = await getAdministratorAccess();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ code: "sign_in_required" }, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    throw error;
  }
  if (access.status === "not_admin") {
    return NextResponse.json({ code: "not_admin" }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (access.status === "mfa_required") {
    return NextResponse.json({ code: "mfa_required" }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({ authorized: true }, {
    headers: { "Cache-Control": "no-store" },
  });
}
