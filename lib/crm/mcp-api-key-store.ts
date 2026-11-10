import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { matrixFromRows, permissionFlags } from "@/lib/crm/agency-access";
import type { PermissionMatrix } from "@/lib/crm/agency-access";
import {
  apiKeyUsable,
  isPersonalApiKey,
  issueMcpApiKey,
  mcpActorSlug,
  mcpApiKeyHashEquals,
  mcpKeyLabelError,
  parseKeyExpiry,
  personalKeyPrefix,
  staffKeyName,
} from "@/lib/crm/mcp-api-key";
import { parseStaffRole, type StaffRole } from "@/lib/crm/staff-team";

export class McpKeyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "McpKeyError";
    this.status = status;
  }
}

export type McpApiKeyView = {
  id: string;
  label: string;
  prefix: string;
  staffId: string;
  staffName: string;
  staffEmail: string;
  staffRole: StaffRole | null;
  staffActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
};

type KeyRow = {
  id: string;
  staff_id: string;
  label: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
};

type StaffRow = {
  id: string;
  role: string;
  full_name: string | null;
  active?: boolean | null;
  email?: string | null;
  auth_user_id?: string;
};

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /crm_mcp_api_keys/i.test(error.message || "");
}

async function staffByIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, StaffRow>();
  if (!unique.length) return map;
  const admin = createServiceClient({ allowPreview: true });
  const first = await admin.from("crm_staff").select("id, role, full_name, active, email, auth_user_id").in("id", unique);
  const rows = first.error
    ? ((await admin.from("crm_staff").select("id, role, full_name, auth_user_id").in("id", unique)).data as StaffRow[] | null)
    : (first.data as StaffRow[] | null);
  for (const row of rows || []) map.set(row.id, row);
  return map;
}

function toView(row: KeyRow, staff: StaffRow | undefined): McpApiKeyView {
  const role = staff ? parseStaffRole(staff.role) : null;
  return {
    id: row.id,
    label: row.label,
    prefix: row.key_prefix,
    staffId: row.staff_id,
    staffName: staffKeyName(staff?.full_name, staff?.email),
    staffEmail: staff?.email || "",
    staffRole: role,
    staffActive: staff?.active !== false,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
  };
}

export async function listMcpApiKeys(): Promise<McpApiKeyView[]> {
  const admin = createServiceClient({ allowPreview: true });
  const { data, error } = await admin
    .from("crm_mcp_api_keys")
    .select("id, staff_id, label, key_prefix, created_at, last_used_at, revoked_at, expires_at")
    .order("created_at", { ascending: false });
  if (missingTable(error)) return [];
  if (error) throw new McpKeyError("Impossible de lire les clés.", 500);
  const rows = (data || []) as KeyRow[];
  const people = await staffByIds(rows.map((row) => row.staff_id));
  return rows.map((row) => toView(row, people.get(row.staff_id)));
}

async function loadStaff(staffId: string) {
  const admin = createServiceClient({ allowPreview: true });
  const first = await admin
    .from("crm_staff")
    .select("id, role, full_name, active, email, auth_user_id")
    .eq("id", staffId)
    .maybeSingle();
  if (first.error && (first.error.code === "42703" || first.error.code === "PGRST204")) {
    const second = await admin.from("crm_staff").select("id, role, full_name, auth_user_id").eq("id", staffId).maybeSingle();
    if (second.error || !second.data) return null;
    return second.data as StaffRow;
  }
  if (first.error || !first.data) return null;
  return first.data as StaffRow;
}

export async function createMcpApiKey(input: {
  staffId: string;
  label: string;
  expiresOn?: string | null;
  createdBy: string | null;
}) {
  const labelError = mcpKeyLabelError(input.label);
  if (labelError) throw new McpKeyError(labelError);
  const expiry = parseKeyExpiry(input.expiresOn);
  if ("error" in expiry) throw new McpKeyError(expiry.error);
  const staff = await loadStaff(input.staffId);
  if (!staff) throw new McpKeyError("Membre introuvable.", 404);
  const role = parseStaffRole(staff.role);
  if (!role || role === "partner") throw new McpKeyError("Un partenaire MyLER n’a pas de clé CRM.", 400);
  if (role === "ratehawk_cert") throw new McpKeyError("La certification Ratehawk n’a pas de clé CRM.", 400);
  if (staff.active === false) throw new McpKeyError("L’accès de ce membre est coupé.", 400);

  const issued = issueMcpApiKey();
  const admin = createServiceClient({ allowPreview: true });
  const { data, error } = await admin
    .from("crm_mcp_api_keys")
    .insert({
      staff_id: staff.id,
      label: input.label.trim(),
      key_prefix: issued.prefix,
      key_hash: issued.hash,
      created_by: input.createdBy,
      expires_at: expiry.expiresAt,
    })
    .select("id, staff_id, label, key_prefix, created_at, last_used_at, revoked_at, expires_at")
    .single();
  if (missingTable(error)) {
    throw new McpKeyError("La table des clés n’est pas encore en place. Appliquez la migration.", 503);
  }
  if (error || !data) throw new McpKeyError("Impossible de créer la clé.", 500);
  return {
    token: issued.token,
    key: toView(data as KeyRow, staff),
  };
}

export async function revokeMcpApiKey(keyId: string) {
  const admin = createServiceClient({ allowPreview: true });
  const { data: existing, error: readError } = await admin
    .from("crm_mcp_api_keys")
    .select("id, staff_id, label, key_prefix, created_at, last_used_at, revoked_at, expires_at")
    .eq("id", keyId)
    .maybeSingle();
  if (missingTable(readError)) {
    throw new McpKeyError("La table des clés n’est pas encore en place. Appliquez la migration.", 503);
  }
  if (readError) throw new McpKeyError("Impossible de lire cette clé.", 500);
  if (!existing) throw new McpKeyError("Clé introuvable.", 404);
  const row = existing as KeyRow;
  if (row.revoked_at) {
    const people = await staffByIds([row.staff_id]);
    return { key: toView(row, people.get(row.staff_id)), already: true };
  }
  const revokedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("crm_mcp_api_keys")
    .update({ revoked_at: revokedAt })
    .eq("id", keyId)
    .is("revoked_at", null)
    .select("id, staff_id, label, key_prefix, created_at, last_used_at, revoked_at, expires_at")
    .maybeSingle();
  if (error) throw new McpKeyError("Impossible de révoquer cette clé.", 500);
  const next = (data as KeyRow | null) || { ...row, revoked_at: revokedAt };
  const people = await staffByIds([next.staff_id]);
  return { key: toView(next, people.get(next.staff_id)), already: false };
}

async function readMatrix(admin: ReturnType<typeof createServiceClient>): Promise<PermissionMatrix | null> {
  const { data, error } = await admin.from("crm_role_permissions").select("role, permission, allowed");
  if (error || !data) return null;
  return matrixFromRows(data as { role: string; permission: string; allowed: boolean }[]);
}

/** Authentifie une clé `tbk_`. Révoquée, expirée ou accès coupé : null, sans toucher last_used_at. */
export async function findPersonalMcpAccess(token: string) {
  if (!isPersonalApiKey(token)) return null;
  const prefix = personalKeyPrefix(token);
  if (!prefix) return null;
  const admin = createServiceClient({ allowPreview: true });
  const { data, error } = await admin
    .from("crm_mcp_api_keys")
    .select("id, staff_id, key_hash, revoked_at, expires_at")
    .eq("key_prefix", prefix)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; staff_id: string; key_hash: string; revoked_at: string | null; expires_at: string | null };
  if (!mcpApiKeyHashEquals(token, row.key_hash)) return null;
  const staff = await loadStaff(row.staff_id);
  const role = staff ? parseStaffRole(staff.role) : null;
  const active = Boolean(staff) && staff?.active !== false && role !== null && role !== "partner" && role !== "ratehawk_cert";
  if (!apiKeyUsable({ revokedAt: row.revoked_at, expiresAt: row.expires_at, staffActive: active })) return null;
  const matrix = await readMatrix(admin);
  const name = staffKeyName(staff?.full_name, staff?.email);
  const allows = permissionFlags(role as StaffRole, matrix) as Record<string, boolean>;
  await admin
    .from("crm_mcp_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("revoked_at", null);
  return {
    actor: mcpActorSlug(name),
    passport: false as const,
    cards: false as const,
    cards_create: allows.create_pliant_card === true,
    cards_read: false as const,
    staff: {
      id: staff!.id,
      role: role as StaffRole,
      name,
      keyId: row.id,
      allows,
    },
  };
}
