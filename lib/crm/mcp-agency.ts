import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { createMcpApiKey, listMcpApiKeys, McpKeyError, revokeMcpApiKey } from "@/lib/crm/mcp-api-key-store";
import {
  memberNameFromEmail,
  mcpKeyLabelError,
  mcpMemberEmailError,
  parseKeyExpiry,
  parseMcpMemberRole,
  staffKeyName,
} from "@/lib/crm/mcp-api-key";
import { currentMcpAccess, type McpAccess } from "@/lib/crm/mcp-auth";
import { MCP_ADMIN_DENIAL } from "@/lib/crm/mcp-role";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { addColleague, setColleagueActive, setColleagueRole, StaffTeamError, listColleagues } from "@/lib/crm/staff-directory";
import { revokeStaffSessions } from "@/lib/crm/staff-departure";
import { isUuid } from "@/lib/crm/ids";
import { parseStaffRole, staffRoleLabel } from "@/lib/crm/staff-team";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";

export type McpAdminActor = {
  staffId: string | null;
  name: string;
};

/** Jeton général, ou clé d’un administrateur. Un agent reçoit un refus clair. */
export function mcpAdminActor(access: McpAccess): McpAdminActor {
  if (access.staff) {
    if (access.staff.role !== "admin") throw new McpWriteError(MCP_ADMIN_DENIAL);
    return { staffId: access.staff.id, name: access.staff.name || "Administrateur" };
  }
  if (access.actor === "mcp" && !access.passport && !access.cards) {
    return { staffId: null, name: "le connecteur" };
  }
  throw new McpWriteError(MCP_ADMIN_DENIAL);
}

function actorFromContext() {
  return mcpAdminActor(currentMcpAccess());
}

function fail(err: unknown): never {
  if (err instanceof McpWriteError) throw err;
  if (err instanceof McpKeyError || err instanceof StaffTeamError) throw new McpWriteError(err.message);
  throw err;
}

async function journal(actor: McpAdminActor, input: {
  action: "view" | "create" | "update";
  summary: string;
  entityId?: string | null;
  diff?: unknown;
  sensitive?: "role_change" | null;
}) {
  await recordAgencyJournal({
    staffId: actor.staffId,
    action: input.action,
    entityType: "user",
    entityId: input.entityId ?? null,
    summary: input.summary.slice(0, 500),
    diff: input.diff,
    sensitive: input.sensitive ?? null,
    path: "/api/mcp",
  });
}

function origin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).trim().replace(/\/$/, "");
}

export async function listerMembres() {
  const actor = actorFromContext();
  try {
    const rows = await listColleagues();
    await journal(actor, { action: "view", summary: `Membres de l’agence consultés par ${actor.name}.` });
    return {
      membres: rows.map((row) => ({
        id: row.id,
        nom: row.fullName,
        email: row.email,
        role: row.role,
        actif: row.active,
      })),
    };
  } catch (err) {
    fail(err);
  }
}

export async function ajouterMembre(input: { email?: string; role?: string; nom?: string }) {
  const actor = actorFromContext();
  const email = (input.email || "").trim().toLowerCase();
  const emailError = mcpMemberEmailError(email);
  if (emailError) throw new McpWriteError(emailError);
  const role = parseMcpMemberRole(input.role);
  if (!role) throw new McpWriteError("Rôle attendu : admin ou agent.");
  const nom = (input.nom || "").trim() || memberNameFromEmail(email);
  try {
    const created = await addColleague({ fullName: nom, email, role }, origin());
    await journal(actor, {
      action: "create",
      entityId: created.colleague.id,
      summary: `Membre ajouté : ${created.colleague.fullName} (${role}) par ${actor.name}.`,
      diff: { role, email },
      sensitive: "role_change",
    });
    return {
      ok: true,
      membre: {
        id: created.colleague.id,
        nom: created.colleague.fullName,
        email: created.colleague.email,
        role: created.colleague.role,
        actif: true,
      },
      email_envoye: created.delivered,
      lien: created.link,
    };
  } catch (err) {
    fail(err);
  }
}

export async function changerRoleMembre(input: { staff_id?: string; role?: string }) {
  const actor = actorFromContext();
  const staffId = (input.staff_id || "").trim();
  if (!isUuid(staffId)) throw new McpWriteError("Membre introuvable.");
  const role = parseMcpMemberRole(input.role);
  if (!role) throw new McpWriteError("Rôle attendu : admin ou agent.");
  try {
    const admin = createServiceClient({ allowPreview: true });
    const { data: before } = await admin.from("crm_staff").select("role, full_name").eq("id", staffId).maybeSingle();
    const previous = parseStaffRole((before as { role?: string; full_name?: string | null } | null)?.role);
    const result = await setColleagueRole(staffId, role);
    if (previous === result.role) return { ok: true, staff_id: staffId, role: result.role };
    const who = staffKeyName((before as { full_name?: string | null } | null)?.full_name);
    await journal(actor, {
      action: "update",
      entityId: staffId,
      summary: `Rôle de ${who} : ${previous ? staffRoleLabel(previous) : "?"} → ${staffRoleLabel(result.role)}, par ${actor.name}.`,
      diff: { role: { avant: previous ? staffRoleLabel(previous) : null, apres: staffRoleLabel(result.role) } },
      sensitive: "role_change",
    });
    return { ok: true, staff_id: staffId, role: result.role };
  } catch (err) {
    fail(err);
  }
}

export async function desactiverMembre(input: { staff_id?: string }) {
  const actor = actorFromContext();
  const staffId = (input.staff_id || "").trim();
  if (!isUuid(staffId)) throw new McpWriteError("Membre introuvable.");
  if (actor.staffId && actor.staffId === staffId) {
    throw new McpWriteError("Vous ne pouvez pas désactiver votre propre accès.");
  }
  try {
    const result = await setColleagueActive(staffId, false, actor.staffId || "00000000-0000-0000-0000-000000000000");
    const admin = createServiceClient({ allowPreview: true });
    const { data: row } = await admin.from("crm_staff").select("id, auth_user_id, full_name").eq("id", staffId).maybeSingle();
    if (row) await revokeStaffSessions(admin, row as { id: string; auth_user_id: string });
    const who = staffKeyName((row as { full_name?: string | null } | null)?.full_name);
    await journal(actor, {
      action: "update",
      entityId: staffId,
      summary: `Accès de ${who} coupé par ${actor.name}. Ses clés API sont refusées.`,
      diff: { actif: { avant: true, apres: result.active } },
    });
    return { ok: true, staff_id: staffId, actif: result.active };
  } catch (err) {
    fail(err);
  }
}

function keyPayload(key: {
  id: string;
  label: string;
  prefix: string;
  staffId: string;
  staffName: string;
  staffEmail: string;
  staffRole: string | null;
  staffActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
}) {
  return {
    id: key.id,
    libelle: key.label,
    prefixe: key.prefix,
    staff_id: key.staffId,
    membre: key.staffName,
    email: key.staffEmail,
    role: key.staffRole,
    actif: key.staffActive,
    creee_le: key.createdAt,
    utilisee_le: key.lastUsedAt,
    revoquee_le: key.revokedAt,
    expire_le: key.expiresAt,
  };
}

export async function listerClesApi() {
  const actor = actorFromContext();
  try {
    const keys = await listMcpApiKeys();
    await journal(actor, { action: "view", summary: `Clés API consultées par ${actor.name}.` });
    return { cles: keys.map(keyPayload) };
  } catch (err) {
    fail(err);
  }
}

export async function creerCleApi(input: { staff_id?: string; libelle?: string; expire_le?: string }) {
  const actor = actorFromContext();
  const staffId = (input.staff_id || "").trim();
  if (!isUuid(staffId)) throw new McpWriteError("Membre introuvable.");
  const labelError = mcpKeyLabelError(input.libelle || "");
  if (labelError) throw new McpWriteError(labelError);
  const expiry = parseKeyExpiry(input.expire_le);
  if ("error" in expiry) throw new McpWriteError(expiry.error);
  try {
    const created = await createMcpApiKey({
      staffId,
      label: (input.libelle || "").trim(),
      expiresOn: input.expire_le,
      createdBy: actor.staffId,
    });
    await journal(actor, {
      action: "create",
      entityId: created.key.staffId,
      summary: `Clé API « ${created.key.label} » (${created.key.prefix}) créée pour ${created.key.staffName} par ${actor.name}.`,
      diff: { prefixe: created.key.prefix, libelle: created.key.label },
    });
    return {
      ok: true,
      cle: created.token,
      message: "Copiez cette clé maintenant. Elle ne sera plus affichée.",
      ...keyPayload(created.key),
    };
  } catch (err) {
    fail(err);
  }
}

export async function revoquerCleApi(input: { cle_id?: string }) {
  const actor = actorFromContext();
  const keyId = (input.cle_id || "").trim();
  if (!isUuid(keyId)) throw new McpWriteError("Clé introuvable.");
  try {
    const result = await revokeMcpApiKey(keyId);
    if (!result.already) {
      await journal(actor, {
        action: "update",
        entityId: result.key.staffId,
        summary: `Clé API « ${result.key.label} » (${result.key.prefix}) révoquée par ${actor.name}.`,
        diff: { prefixe: result.key.prefix, revoquee: true },
      });
    }
    return {
      ok: true,
      deja: result.already,
      ...keyPayload(result.key),
    };
  } catch (err) {
    fail(err);
  }
}
