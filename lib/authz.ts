import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export class AuthorizationError extends Error {
  constructor(message: string, public readonly status: 401 | 403) {
    super(message);
  }
}

export async function requireSignedInUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AuthorizationError("Sign-in is required.", 401);
  return { supabase, user };
}

export async function getAdministratorAccess() {
  const { supabase, user } = await requireSignedInUser();
  if (user.app_metadata.role !== "super_admin") {
    return { status: "not_admin" as const };
  }
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error("Administrator MFA status could not be verified.");
  if (data.currentLevel !== "aal2") {
    return { status: "mfa_required" as const };
  }
  return { status: "authorized" as const, supabase, user };
}

export async function requireAdministrator() {
  const access = await getAdministratorAccess();
  if (access.status === "not_admin") {
    throw new AuthorizationError("Administrator access is required.", 403);
  }
  if (access.status === "mfa_required") {
    throw new AuthorizationError("Complete multi-factor authentication to continue.", 403);
  }
  return { supabase: access.supabase, user: access.user };
}
