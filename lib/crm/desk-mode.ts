import { createHash, createHmac } from "node:crypto";
import { productionOnlySecret } from "./preview-secrets";
import { secretEquals } from "./secret-equals";

/**
 * Mode agence (« desk ») : un agent connecté ouvre l’espace d’un client depuis sa fiche
 * (`POST /api/admin/clients/[id]/ouvrir`). Lien court à usage unique, 10 minutes, journalisé
 * avec l’agent. Plus de code maître : aucun secret partagé ne donne l’espace d’un client.
 */

/** Cookie court : saute le mot de passe à définir et le mur téléphone, seulement pour cette ouverture. */
export const DESK_COOKIE = "tb_desk";
export const DESK_TTL_SECONDS = 4 * 60 * 60;

/** Lien d’ouverture par l’agence : 10 minutes, une seule ouverture, jamais régénéré. */
export const DESK_LINK_TTL_MS = 10 * 60 * 1000;
export const DESK_LINK_MAX_OPENS = 1;

const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Clé du cookie desk, dérivée de la clé de service (jamais d’un code saisi). Absente : mode coupé. */
function deskSecret() {
  const service = productionOnlySecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!service) return null;
  return createHash("sha256").update(`travelba:tb_desk:v2:${service}`).digest();
}

export type AuthLinkRow = { id: string; authUserId: string | null };

export type AuthLinkAdmin = {
  listByEmail: (email: string) => Promise<AuthLinkRow[] | null>;
  createConfirmedUser: (email: string) => Promise<{ id: string | null; alreadyExists: boolean }>;
  /** Compte existant pour cet e-mail. Doit renvoyer null pour un compte de l’agence. */
  findExistingUserId: (email: string) => Promise<string | null>;
  attach: (customerId: string, authUserId: string) => Promise<string | null>;
};

/** Compte Auth confirmé, sans mot de passe et sans message. */
export function confirmedClientUser(email: string) {
  return {
    email,
    email_confirm: true as const,
    app_metadata: { crm_role: "client" as const },
  };
}

/**
 * Une fiche sans auth_user_id reçoit un compte. Deux fiches, ou aucune : on ne crée rien.
 * Un compte déjà lié est réutilisé.
 */
export async function linkCustomerAuth(email: string, admin: AuthLinkAdmin) {
  const rows = await admin.listByEmail(email);
  if (!rows || rows.length !== 1) return null;
  const row = rows[0];
  if (row.authUserId && USER_ID_RE.test(row.authUserId)) return row.authUserId;

  const created = await admin.createConfirmedUser(email);
  let userId = created.id;
  if (!userId && created.alreadyExists) userId = await admin.findExistingUserId(email);
  if (!userId || !USER_ID_RE.test(userId)) return null;
  const attached = await admin.attach(row.id, userId);
  if (!attached || !USER_ID_RE.test(attached)) return null;
  return attached;
}

export type DeskOpenDecision = "open" | "same-session" | "other-session" | "refuse";

/**
 * Ouverture d’un lien desk.
 * - révoqué, expiré ou déjà ouvert : refus ;
 * - le client est déjà connecté ici : on y va sans consommer le lien ;
 * - une autre session est ouverte (souvent l’agent lui-même) : on ne l’écrase pas,
 *   le lien reste intact pour une fenêtre privée ou le téléphone du client ;
 * - sinon : ouverture.
 */
export function deskOpenDecision(input: {
  now: Date;
  expiresAt: Date;
  revokedAt: Date | string | null | undefined;
  openCount: number | null | undefined;
  sessionEmail: string | null | undefined;
  linkEmail: string | null | undefined;
}): DeskOpenDecision {
  if (input.revokedAt) return "refuse";
  if (input.now.getTime() > input.expiresAt.getTime()) return "refuse";
  if ((input.openCount ?? 0) >= DESK_LINK_MAX_OPENS) return "refuse";
  const session = (input.sessionEmail || "").trim().toLowerCase();
  if (!session) return "open";
  const target = (input.linkEmail || "").trim().toLowerCase();
  return target && session === target ? "same-session" : "other-session";
}

export function accessWhileDesk(input: {
  desk: boolean;
  mustSetPassword: boolean;
  needsOnboarding: boolean;
  staff: boolean;
}) {
  if (!input.desk) return input;
  return {
    desk: true,
    mustSetPassword: false,
    needsOnboarding: false,
    staff: false,
  };
}

export function signDesk(userId: string, expSeconds: number) {
  const secret = deskSecret();
  if (!secret || !USER_ID_RE.test(userId) || !Number.isFinite(expSeconds)) return null;
  const payload = `${Math.floor(expSeconds)}.${userId}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function deskBypass(
  token: string | undefined | null,
  userId: string,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  const secret = deskSecret();
  if (!secret || !token || !USER_ID_RE.test(userId)) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expRaw, id, sig] = parts;
  if (!expRaw || !id || !sig || id !== userId) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= nowSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${expRaw}.${id}`).digest("base64url");
  return secretEquals(sig, expected);
}

export function deskSetCookie(userId: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const exp = nowSeconds + DESK_TTL_SECONDS;
  const value = signDesk(userId, exp);
  if (!value) return null;
  return { name: DESK_COOKIE, value, options: deskCookieOptions(DESK_TTL_SECONDS) };
}

export function deskClearCookie() {
  return { name: DESK_COOKIE, value: "", options: deskCookieOptions(0) };
}

function deskCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
