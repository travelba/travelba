import { createHash, createHmac } from "node:crypto";
import { secretEquals } from "./secret-equals";

/** Cookie court : saute le mot de passe à définir et le mur téléphone, seulement pour cette ouverture. */
export const DESK_COOKIE = "tb_desk";
export const DESK_TTL_SECONDS = 4 * 60 * 60;

const WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 40;
const EMAIL_LIMIT = 12;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CustomerAuth = { authUserId: string | null };

export type ClientLoginDeps = {
  findCustomer: (email: string) => Promise<CustomerAuth | null>;
  openSession: (authUserId: string) => Promise<boolean>;
  /**
   * Fiche sans compte : crée l’utilisateur Auth et enregistre auth_user_id.
   * N’envoie rien, ne choisit pas de mot de passe.
   */
  provisionAuthUser?: (email: string) => Promise<string | null>;
};

export type ClientLoginResult =
  | { action: "fallback" }
  | { action: "reject" }
  | { action: "open"; authUserId: string };

export type LoginPlan = "client-fallback" | "password" | "reject" | "open";

type Bucket = { count: number; resetAt: number };

const attempts = new Map<string, Bucket>();

export function adminClientCode() {
  const value = process.env.ADMIN_CLIENT_CODE;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/** Comparaison indépendante de la longueur. Ne journalise rien. Implémentation : secret-equals.ts. */
export { secretEquals };

export function normalizeLoginEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function clientAddress(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);
  const real = headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : "unknown";
}

/**
 * Code absent : le formulaire mot de passe actuel.
 * Code différent : le mot de passe du client.
 * Code juste et client introuvable, ou trop de tentatives : échec ordinaire.
 * Fiche sans compte : un seul client pour cet e-mail, puis création du compte.
 * Le mot de passe du client n’est jamais réécrit.
 */
export async function attemptClientLogin(
  input: {
    email: string;
    password: string;
    ip?: string | null;
    now?: number;
    store?: Map<string, Bucket>;
    limits?: { ip?: number; email?: number; windowMs?: number };
  },
  deps: ClientLoginDeps
): Promise<ClientLoginResult> {
  const code = adminClientCode();
  if (!code) return { action: "fallback" };

  const password = typeof input.password === "string" ? input.password : "";
  const match = secretEquals(password, code);
  const email = normalizeLoginEmail(input.email || "");
  const allowed = noteAdminAttempt(input.store ?? attempts, {
    ip: (input.ip || "unknown").slice(0, 64),
    email: email ?? "invalid",
    now: input.now ?? Date.now(),
    ipLimit: input.limits?.ip ?? IP_LIMIT,
    emailLimit: input.limits?.email ?? EMAIL_LIMIT,
    windowMs: input.limits?.windowMs ?? WINDOW_MS,
  });

  if (!match) return { action: "fallback" };
  if (!allowed || !email) return { action: "reject" };

  const customer = await deps.findCustomer(email);
  if (!customer) return { action: "reject" };

  let authUserId = customer.authUserId;
  if (!authUserId || !USER_ID_RE.test(authUserId)) {
    authUserId = deps.provisionAuthUser ? await deps.provisionAuthUser(email) : null;
  }
  if (!authUserId || !USER_ID_RE.test(authUserId)) return { action: "reject" };

  const opened = await deps.openSession(authUserId);
  if (!opened) return { action: "reject" };
  return { action: "open", authUserId };
}

export type AuthLinkRow = { id: string; authUserId: string | null };

export type AuthLinkAdmin = {
  listByEmail: (email: string) => Promise<AuthLinkRow[] | null>;
  createConfirmedUser: (email: string) => Promise<{ id: string | null; alreadyExists: boolean }>;
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

/** Feature coupée : le navigateur garde la connexion actuelle. Sinon le serveur vérifie le mot de passe. */
export function loginRoutePlan(feature: boolean, result: ClientLoginResult): LoginPlan {
  if (result.action === "open") return "open";
  if (result.action === "reject") return "reject";
  if (!feature) return "client-fallback";
  return "password";
}

export type SessionAdmin = {
  getUserById: (id: string) => Promise<{
    user: { id: string; email?: string | null } | null;
    error: boolean;
  }>;
  generateLink: (email: string) => Promise<{ tokenHash: string | null; error: boolean }>;
};

/**
 * Ouvre une session Supabase pour l’utilisateur déjà lié.
 * Le jeton est vérifié tout de suite : rien n’est envoyé par e-mail ou WhatsApp,
 * et le mot de passe n’est pas modifié.
 */
export async function openServiceSession(
  admin: SessionAdmin,
  authUserId: string,
  verify: (tokenHash: string) => Promise<boolean>
) {
  if (!USER_ID_RE.test(authUserId)) return false;
  const loaded = await admin.getUserById(authUserId);
  const email = loaded.user?.email?.trim().toLowerCase();
  if (loaded.error || !email) return false;
  const link = await admin.generateLink(email);
  if (link.error || !link.tokenHash) return false;
  return verify(link.tokenHash);
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
  const secret = adminClientCode();
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
  const secret = adminClientCode();
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

function noteAdminAttempt(
  store: Map<string, Bucket>,
  input: { ip: string; email: string; now: number; ipLimit: number; emailLimit: number; windowMs: number }
) {
  pruneAttempts(store, input.now);
  const ipOk = hit(store, `ip:${hashKey(input.ip)}`, input.now, input.ipLimit, input.windowMs);
  const emailOk = hit(store, `em:${hashKey(input.email)}`, input.now, input.emailLimit, input.windowMs);
  return ipOk && emailOk;
}

function hit(store: Map<string, Bucket>, key: string, now: number, limit: number, windowMs: number) {
  const current = store.get(key);
  if (!current || now >= current.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function pruneAttempts(store: Map<string, Bucket>, now: number) {
  if (store.size < 2000) return;
  for (const [key, bucket] of store) {
    if (now >= bucket.resetAt) store.delete(key);
  }
}

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
