/**
 * Droits de l’agence. Pur : la matrice, les alertes, le masque.
 * Tous les rôles de l’agence voient tous les dossiers, marges et commissions comprises :
 * il n’y a pas de périmètre « ses dossiers seulement ». La marge reste invisible côté client.
 * Aucune action ne demande de validation ; aucun plafond. Les alertes préviennent, elles ne bloquent pas.
 * Le partenaire MyLER n’entre pas dans la matrice : il n’ouvre que Little Emperors.
 * L’administrateur reste tout ouvert, même si la matrice est modifiée.
 */

import { AGENCY_ROLES, type AgencyRole, type StaffRole } from "./staff-team";

export type { AgencyRole, StaffRole };

export const PERMISSIONS = [
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
  edit_dossiers: "Modifier les dossiers",
  create_dossiers: "Créer un dossier",
  reassign_dossier: "Attribuer un dossier à un collègue",
  view_finances: "Voir les finances",
  edit_finances: "Écrire au grand livre",
  view_margins: "Voir marges, prix nets et commission",
  create_pliant_card: "Créer une carte Pliant",
  pay_supplier: "Payer un fournisseur",
  message_client: "Écrire au client",
  passport_reveal: "Ouvrir le coffre passeport",
  export_data: "Exporter des données",
  delete_archive: "Archiver ou supprimer",
  change_settings: "Changer les réglages",
  manage_users: "Gérer l’équipe",
  view_journal: "Voir le journal de toute l’agence",
  view_inbox: "Voir les boîtes de réception",
};

/** Rôles dont la matrice est réglable. L’administrateur n’y figure pas : il a tout. */
export const CONFIGURABLE_ROLES = ["manager", "agent", "comptable", "lecture"] as const;
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

export type PermissionMatrix = Partial<Record<AgencyRole, Partial<Record<Permission, boolean>>>>;

/** 5 000 € : une sortie au-dessus prévient les administrateurs. Information seulement. */
export const DEFAULT_PAYMENT_ALERT_CENTS = 500_000;
/** Cinq échecs en quinze minutes préviennent les administrateurs. */
export const DEFAULT_FAILED_LOGIN_ALERTS = 5;
export const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Domaine des comptes Google de l’agence. */
export const AGENCY_GOOGLE_DOMAIN = "travelba.fr";

function allow(keys: readonly Permission[]): Record<Permission, boolean> {
  const row = Object.fromEntries(PERMISSIONS.map((key) => [key, false])) as Record<Permission, boolean>;
  for (const key of keys) row[key] = true;
  return row;
}

export const DEFAULT_MATRIX: Record<AgencyRole, Record<Permission, boolean>> = {
  admin: allow(PERMISSIONS),
  manager: allow([
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
    "edit_dossiers",
    "create_dossiers",
    "view_finances",
    "edit_finances",
    "view_margins",
    "create_pliant_card",
    "pay_supplier",
    "message_client",
    "passport_reveal",
    "view_inbox",
  ]),
  comptable: allow([
    "view_finances",
    "edit_finances",
    "view_margins",
    "pay_supplier",
    "export_data",
    "view_journal",
  ]),
  lecture: allow([]),
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

/** Alertes informatives : elles préviennent les administrateurs et ne bloquent jamais le geste. */
export const ALERT_KINDS = [
  "passport_reveal",
  "card_reveal",
  "export",
  "payment",
  "refund",
  "failed_login",
  "role_change",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_LABELS: Record<AlertKind, string> = {
  passport_reveal: "Passeport ouvert",
  card_reveal: "Carte ouverte",
  export: "Export",
  payment: "Paiement",
  refund: "Remboursement",
  failed_login: "Connexions refusées",
  role_change: "Rôle modifié",
};

export function paymentAlert(amountCents: number | null | undefined, threshold = DEFAULT_PAYMENT_ALERT_CENTS) {
  if (amountCents == null || !Number.isFinite(amountCents)) return null;
  if (Math.abs(amountCents) < threshold) return null;
  const euros = Math.round(Math.abs(amountCents) / 100).toLocaleString("fr-FR");
  return { kind: "payment" as const, summary: `Paiement de ${euros} €, au-dessus du seuil.` };
}

export function refundAlert(amountCents: number | null | undefined) {
  if (amountCents == null || !Number.isFinite(amountCents) || amountCents === 0) {
    return { kind: "refund" as const, summary: "Remboursement enregistré." };
  }
  const euros = (Math.abs(amountCents) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 });
  return { kind: "refund" as const, summary: `Remboursement de ${euros} €.` };
}

export function failedLoginAlert(count: number, limit = DEFAULT_FAILED_LOGIN_ALERTS) {
  if (count < limit) return null;
  return {
    kind: "failed_login" as const,
    summary: `${count} connexions refusées en quinze minutes.`,
  };
}

/**
 * Connexion Google : l’adresse doit être du domaine de l’agence et correspondre à un collègue invité.
 * `staffEmails` : les adresses des lignes `crm_staff` actives. Pur, sans réseau.
 */
export function googleStaffEmailAllowed(
  email: string | null | undefined,
  staffEmails: Iterable<string>,
  domain = AGENCY_GOOGLE_DOMAIN
): { ok: true; email: string } | { ok: false; reason: "domaine" | "inconnu" } {
  const address = (email || "").trim().toLowerCase();
  if (!address || !address.endsWith(`@${domain}`)) return { ok: false, reason: "domaine" };
  for (const known of staffEmails) {
    if ((known || "").trim().toLowerCase() === address) return { ok: true, email: address };
  }
  return { ok: false, reason: "inconnu" };
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

/* ---------- Responsables d’un dossier ---------- */

export type DossierPerson = { id: string; name: string };

/**
 * Les intervenants d’un dossier : les collègues qui ont agi dessus, d’après le journal, du plus récent
 * au plus ancien, sans doublon. Le créateur et le responsable y figurent même sans ligne de journal.
 */
export function dossierIntervenants(input: {
  journalStaffIds: readonly (string | null | undefined)[];
  createdById: string | null;
  ownerId: string | null;
  names: ReadonlyMap<string, string>;
}): DossierPerson[] {
  const seen = new Set<string>();
  const people: DossierPerson[] = [];
  const push = (id: string | null | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    people.push({ id, name: input.names.get(id) || "Collègue" });
  };
  for (const id of input.journalStaffIds) push(id);
  push(input.ownerId);
  push(input.createdById);
  return people;
}

/** Qui peut poser qui comme responsable. Pur : la route et l’écran suivent la même règle. */
export function responsableChangeAllowed(input: {
  actorId: string;
  canReassign: boolean;
  canEdit: boolean;
  nextOwnerId: string | null;
}): { ok: true } | { ok: false; message: string } {
  if (input.canReassign) return { ok: true };
  if (!input.canEdit) return { ok: false, message: "Cette action n’est pas ouverte pour votre rôle." };
  if (input.nextOwnerId === input.actorId) return { ok: true };
  return { ok: false, message: "Vous pouvez vous mettre en charge ; attribuer à un collègue est réservé aux administrateurs." };
}

export function responsableChangeSummary(input: {
  previousName: string | null;
  nextName: string | null;
  selfTake: boolean;
}) {
  if (input.selfTake) return `Prend le dossier en charge (avant : ${input.previousName || "à prendre"}).`;
  if (!input.nextName) return `Dossier remis à prendre (avant : ${input.previousName || "à prendre"}).`;
  return `En charge : ${input.previousName || "à prendre"} → ${input.nextName}.`;
}

/** Départ d’un collègue : ce qui est fait, en une phrase par geste, sans secret. */
export function departurePlan(input: { ownedCount: number; reassignToName: string | null; cutAccess: boolean }) {
  const steps: string[] = [];
  if (input.cutAccess) steps.push("Accès coupé et sessions fermées.");
  if (input.ownedCount > 0 && input.reassignToName) {
    steps.push(`${input.ownedCount} dossier${input.ownedCount > 1 ? "s" : ""} réattribué${input.ownedCount > 1 ? "s" : ""} à ${input.reassignToName}.`);
  } else if (input.ownedCount > 0) {
    steps.push(`${input.ownedCount} dossier${input.ownedCount > 1 ? "s" : ""} en charge rest${input.ownedCount > 1 ? "ent" : "e"} à prendre.`);
  }
  return steps;
}
