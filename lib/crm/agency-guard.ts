/**
 * Droits côté pages et handlers. Même décision que la garde des routes.
 */

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/crm/auth";
import {
  matrixFromRows,
  roleAllows,
  type Permission,
  type PermissionMatrix,
  type StaffRole,
} from "@/lib/crm/agency-access";
import type { CrmStaff } from "@/lib/crm/types";

export const loadPermissionMatrix = cache(async (): Promise<PermissionMatrix | null> => {
  try {
    const admin = createServiceClient({ allowPreview: true });
    const { data, error } = await admin.from("crm_role_permissions").select("role, permission, allowed");
    if (error || !data) return null;
    return matrixFromRows(data as { role: string; permission: string; allowed: boolean }[]);
  } catch {
    return null;
  }
});

export async function staffAllows(staff: Pick<CrmStaff, "role">, permission: Permission) {
  const matrix = await loadPermissionMatrix();
  if (matrix == null && (staff.role === "admin" || staff.role === "agent")) return true;
  return roleAllows(staff.role as StaffRole, permission, matrix);
}

/** Null tant que la matrice n’est pas en base : le menu admin/agent ne change pas. */
export async function navAllows(staff: Pick<CrmStaff, "role">) {
  const matrix = await loadPermissionMatrix();
  if (matrix == null && (staff.role === "admin" || staff.role === "agent")) return null;
  const flags = {} as Record<Permission, boolean>;
  for (const permission of [
    "view_finances",
    "view_inbox",
    "edit_dossiers",
    "change_settings",
    "manage_users",
    "view_journal",
  ] as const) {
    flags[permission] = roleAllows(staff.role as StaffRole, permission, matrix);
  }
  return flags;
}

export async function assertStaffPermission(staff: Pick<CrmStaff, "role">, permission: Permission) {
  const matrix = await loadPermissionMatrix();
  const legacy = matrix == null && (staff.role === "admin" || staff.role === "agent");
  if (legacy) return null;
  if (roleAllows(staff.role as StaffRole, permission, matrix)) return null;
  return jsonError("Cette action n’est pas ouverte pour votre rôle.", 403);
}

export async function requirePermissionPage(permission: Permission) {
  const { redirect } = await import("next/navigation");
  const { requireStaffPage } = await import("@/lib/crm/auth");
  const ctx = await requireStaffPage();
  const allowed = await staffAllows(ctx.staff, permission);
  if (!allowed) redirect("/admin");
  return ctx;
}
