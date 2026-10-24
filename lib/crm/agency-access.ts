/**
 * Droits de l’agence. Pur : la matrice, le périmètre d’un dossier, le plafond Pliant.
 * Le partenaire MyLER n’entre pas dans la matrice : il n’ouvre que Little Emperors.
 * L’administrateur reste tout ouvert, même si la matrice est modifiée, pour ne pas
 * fermer l’agence sur elle-même.
 */

import { AGENCY_ROLES, type AgencyRole, type StaffRole } from "./staff-team";

export type { AgencyRole, StaffRole };

export const PERMISSIONS = [
  "view_all_dossiers",
  "view_assigned_dossiers",
  "edit_dossiers",
  "create_dossiers",
  "reassign_dossier",
  "view_finances",
  "edit_finances",
  "view_margins",
  "create_pliant_card",
  "pay_supplier",
  "message_client",
  "passport_reveal",
  "export_data",
  "delete_archive",
  "change_settings",
  "manage_users",
  "view_journal",
  "view_inbox",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  view_all_dossiers: "Voir tous les dossiers",
  view_assigned_dossiers: "Voir ses dossiers et le pool commun",
  edit_dossiers: "Modifier les dossiers",
  create_dossiers: "Créer un dossier",
  reassign_dossier: "Changer l’agent responsable",
  view_finances: "Voir les finances",
  edit_finances: "Écrire au grand livre",
  view_margins: "Voir marges, prix nets et commission",
  create_pliant_card: "Créer une carte Pliant",
  pay_supplier: "Payer un fournisseur",
  message_client: "Écrire au client",
  passport_reveal: "Révéler le coffre passeport",
  export_data: "Exporter des données",
  delete_archive: "Archiver ou supprimer",
  change_settings: "Changer les réglages",
  manage_users: "Gérer les utilisateurs",
  view_journal: "Voir le journal",
  view_inbox: "Voir les boîtes de réception",
};

/** Rôles dont la matrice est réglable. L’administrateur n’y figure pas : il a tout. */
export const CONFIGURABLE_ROLES = ["manager", "agent", "comptable", "lecture"] as const;
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

export type PermissionMatrix = Partial<Record<AgencyRole, Partial<Record<Permission, boolean>>>>;

/** 2 000 € : un agent ne crée pas une carte au-dessus. Décision à confirmer. */
export const DEFAULT_PLIANT_AGENT_CEILING_CENTS = 200_000;
/** 5 000 € : une sortie au-dessus prévient les administrateurs. Décision à confirmer. */
export const DEFAULT_PAYMENT_ALERT_CENTS = 500_000;
/** Cinq échecs en quinze minutes préviennent les administrateurs. */
export const DEFAULT_FAILED_LOGIN_ALERTS = 5;
export const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

const OWNER_EMAIL = "benjamin@travelba.fr";

function allow(keys: readonly Permission[]): Record<Permission, boolean> {
  const row = Object.fromEntries(PERMISSIONS.map((key) => [key, false])) as Record<Permission, boolean>;
  for (const key of keys) row[key] = true;
  return row;
}

export const DEFAULT_MATRIX: Record<AgencyRole, Record<Permission, boolean>> = {
  admin: allow(PERMISSIONS),
  manager: allow([
    "view_all_dossiers",
    "view_assigned_dossiers",
    "edit_dossiers",
    "create_dossiers",
    "reassign_dossier",
    "view_finances",
    "view_margins",
    "create_pliant_card",
    "message_client",
    "passport_reveal",
    "delete_archive",
    "view_journal",
    "view_inbox",
  ]),
  agent: allow([
    "view_assigned_dossiers",
    "edit_dossiers",
    "create_dossiers",
    "create_pliant_card",
    "message_client",
    "passport_reveal",
    "view_inbox",
  ]),
  comptable: allow([
    "view_all_dossiers",
    "view_assigned_dossiers",
    "view_finances",
    "edit_finances",
    "view_margins",
    "pay_supplier",
    "export_data",
    "view_journal",
  ]),
  lecture: allow(["view_all_dossiers", "view_assigned_dossiers"]),
};

export function isAgencyRole(value: unknown): value is AgencyRole {
  return typeof value === "string" && (AGENCY_ROLES as readonly string[]).includes(value);
}

export function isStaffRoleValue(value: unknown): value is StaffRole {
  return value === "partner" || isAgencyRole(value);
}

/**
 * Droit effectif. Sans matrice (table absente), les défauts s’appliquent.
 * Un trou dans la matrice retombe sur le défaut du rôle.
 */
export function roleAllows(role: StaffRole, permission: Permission, matrix?: PermissionMatrix | null): boolean {
  if (role === "partner") return false;
  if (role === "admin") return true;
  const override = matrix?.[role]?.[permission];
  if (typeof override === "boolean") return override;
  return DEFAULT_MATRIX[role][permission];
}

export function rightsGrid(matrix?: PermissionMatrix | null) {
  const grid = {} as Record<ConfigurableRole, Record<Permission, boolean>>;
  for (const role of CONFIGURABLE_ROLES) {
    grid[role] = {} as Record<Permission, boolean>;
    for (const permission of PERMISSIONS) {
      grid[role][permission] = roleAllows(role, permission, matrix);
    }
  }
  return grid;
}

export function permissionFlags(
  role: StaffRole,
  matrix?: PermissionMatrix | null
): Record<Permission, boolean> {
  return Object.fromEntries(PERMISSIONS.map((key) => [key, roleAllows(role, key, matrix)])) as Record<
    Permission,
    boolean
  >;
}

export function matrixFromRows(
  rows: { role: string; permission: string; allowed: boolean }[]
): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  for (const row of rows) {
    if (!isAgencyRole(row.role)) continue;
    if (!(PERMISSIONS as readonly string[]).includes(row.permission)) continue;
    const role = row.role;
    matrix[role] = matrix[role] || {};
    matrix[role]![row.permission as Permission] = row.allowed === true;
  }
  return matrix;
}

/** L’administrateur n’est pas enregistré : il reste tout ouvert. */
export function sanitizeMatrixUpdate(
  input: unknown
): { role: ConfigurableRole; permission: Permission; allowed: boolean }[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const updates: { role: ConfigurableRole; permission: Permission; allowed: boolean }[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") return null;
    const role = (row as { role?: unknown }).role;
    const permission = (row as { permission?: unknown }).permission;
    const allowed = (row as { allowed?: unknown }).allowed;
    if (!(CONFIGURABLE_ROLES as readonly string[]).includes(String(role))) return null;
    if (!(PERMISSIONS as readonly string[]).includes(String(permission))) return null;
    if (typeof allowed !== "boolean") return null;
    const key = `${role}:${permission}`;
    if (seen.has(key)) return null;
    seen.add(key);
    updates.push({
      role: role as ConfigurableRole,
      permission: permission as Permission,
      allowed,
    });
  }
  return updates;
}

export function bookingVisibleTo(input: {
  role: StaffRole;
  staffId: string;
  ownerStaffId: string | null;
  assigneeIds: readonly string[];
  matrix?: PermissionMatrix | null;
}) {
  if (input.role === "partner") return false;
  if (roleAllows(input.role, "view_all_dossiers", input.matrix)) return true;
  if (!roleAllows(input.role, "view_assigned_dossiers", input.matrix)) return false;
  if (!input.ownerStaffId) return true;
  if (input.ownerStaffId === input.staffId) return true;
  return input.assigneeIds.includes(input.staffId);
}

export function pliantCeilingAllows(
  role: StaffRole,
  limitCents: number | null,
  ceilingCents = DEFAULT_PLIANT_AGENT_CEILING_CENTS
): { ok: true } | { ok: false; message: string } {
  if (role === "admin" || role === "manager") return { ok: true };
  if (role !== "agent") return { ok: false, message: "La création de carte est réservée." };
  if (limitCents == null || !Number.isFinite(limitCents) || limitCents <= 0) {
    return { ok: false, message: "Le plafond de cette carte n’est pas lisible. Un administrateur peut l’émettre." };
  }
  if (limitCents > ceilingCents) {
    const euros = Math.round(ceilingCents / 100).toLocaleString("fr-FR");
    return {
      ok: false,
      message: `Ce plafond dépasse ${euros} €. Un administrateur peut l’émettre.`,
    };
  }
  return { ok: true };
}

/** Le plus haut prix d’hôtel saisi, en centimes. Sert de plafond avant l’émission. */
export function hotelCardEstimateCents(items: readonly { kind: string; amount: number | null }[]) {
  const amounts = items
    .filter((item) => item.kind === "hotel" && typeof item.amount === "number" && item.amount > 0)
    .map((item) => Math.round(item.amount! * 100));
  if (!amounts.length) return null;
  return Math.max(...amounts);
}

export function paymentAlert(amountCents: number | null | undefined, threshold = DEFAULT_PAYMENT_ALERT_CENTS) {
  if (amountCents == null || !Number.isFinite(amountCents)) return null;
  if (Math.abs(amountCents) < threshold) return null;
  const euros = Math.round(Math.abs(amountCents) / 100).toLocaleString("fr-FR");
  return { kind: "payment" as const, summary: `Paiement de ${euros} €, au-dessus du seuil.` };
}

export function failedLoginAlert(count: number, limit = DEFAULT_FAILED_LOGIN_ALERTS) {
  if (count < limit) return null;
  return {
    kind: "failed_login" as const,
    summary: `${count} connexions refusées en quinze minutes.`,
  };
}

const DOC_SECRET_KEYS = ["number", "document_number", "mrz", "personal_number", "mrz_line_1", "mrz_line_2"] as const;

export function maskKeepLast(value: string, keep = 3) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.length <= keep) return "•".repeat(trimmed.length);
  return `${"•".repeat(trimmed.length - keep)}${trimmed.slice(-keep)}`;
}

export function maskEmail(email: string) {
  const [name, domain] = email.trim().toLowerCase().split("@");
  if (!name || !domain) return "•••";
  return `${name.slice(0, 1)}•••@${domain}`;
}

export function redactIdentityFields<T extends Record<string, unknown>>(doc: T, reveal: boolean): T {
  if (reveal) return doc;
  const next: Record<string, unknown> = { ...doc };
  for (const key of DOC_SECRET_KEYS) {
    const value = next[key];
    if (typeof value === "string" && value) next[key] = maskKeepLast(value);
  }
  return next as T;
}

/** Passeport et carte d’identité seulement. Un visa reste lisible. */
export function redactVaultDocument<T extends { doc_type?: string | null }>(doc: T, reveal: boolean): T {
  if (reveal) return doc;
  if (doc.doc_type !== "passport" && doc.doc_type !== "id_card") return doc;
  return redactIdentityFields(doc as T & Record<string, unknown>, false) as T;
}

/** Comptes de démonstration. Adresses .invalid : le script refuse le projet de production. */
export const AGENCY_SEED_USERS = [
  { email: "manager.agence@exemple.invalid", role: "manager" as const, fullName: "Morgan Manager" },
  { email: "agent.agence@exemple.invalid", role: "agent" as const, fullName: "Alex Agent" },
  { email: "comptable.agence@exemple.invalid", role: "comptable" as const, fullName: "Camille Comptable" },
  { email: "lecture.agence@exemple.invalid", role: "lecture" as const, fullName: "Robin Lecture" },
] as const;

export const AGENCY_OWNER_EMAIL = OWNER_EMAIL;

export function agencySeedAllowed(projectRef: string | null | undefined) {
  return (projectRef || "").trim() !== "fsmfozxgujskluxakeoq";
}

export function accessTokenClaims(token: string | null | undefined): { sessionId: string | null; iat: number | null } {
  if (!token) return { sessionId: null, iat: null };
  const part = token.split(".")[1];
  if (!part) return { sessionId: null, iat: null };
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(padded)) as { session_id?: unknown; iat?: unknown };
    return {
      sessionId: typeof json.session_id === "string" && json.session_id ? json.session_id : null,
      iat: typeof json.iat === "number" ? json.iat : null,
    };
  } catch {
    return { sessionId: null, iat: null };
  }
}

export function sessionIdFromAccessToken(token: string | null | undefined) {
  return accessTokenClaims(token).sessionId;
}

export function eurosToAlertCents(amount: number) {
  if (!Number.isFinite(amount) || amount === 0) return null;
  return Math.round(Math.abs(amount) * 100);
}
