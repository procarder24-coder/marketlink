export function mayAccessAdmin(role: string | undefined, assuranceLevel: string | undefined) {
  return role === "super_admin" && assuranceLevel === "aal2";
}

