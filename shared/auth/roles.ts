/**
 * The one admin-role rule, shared by page guards. Superadmin is a superset of
 * admin (see adminProcedure in shared/trpc/server.ts). "user" and "vendor"
 * are never admins — this store has no vendor dashboard.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "superadmin";
}
