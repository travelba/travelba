import { productionOnlySecret } from "./preview-secrets";
import {
  restaurantCarouselContentCreateBody,
  restaurantIntroContentCreateBody,
  RESTAURANT_CAROUSEL_ENV,
  RESTAURANT_CAROUSEL_MENU_ENV,
  RESTAURANT_CAROUSEL_MENU_NAME,
  RESTAURANT_CAROUSEL_NAME,
  RESTAURANT_INTRO_ENV,
  RESTAURANT_INTRO_NAME,
} from "./restaurant-whatsapp";
import { resolveContentSid, whatsappContentApproved } from "./twilio-content-sid";

/**
 * Dépôt des trois modèles WhatsApp restaurants chez Twilio, depuis le serveur.
 * Content API seulement (création, demande d’approbation, lecture du statut).
 * Aucun message n’est envoyé : l’API Messages n’est jamais appelée ici.
 * Aucun secret ne sort : les réponses portent le nom, le SID HX… et le statut.
 */

const CONTENT_URL = "https://content.twilio.com/v1/Content";
export const RESTAURANT_TEMPLATE_CATEGORY = "UTILITY";
const LOOKUP_CACHE_MS = 10 * 60 * 1000;
const MAX_PAGES = 20;

export type RestaurantTemplateDraft = {
  /** Variable d’environnement qui porte le SID une fois le modèle approuvé. */
  env: string;
  /** Nom Twilio (friendly_name), stable : il sert à retrouver le modèle sans variable. */
  friendlyName: string;
  create: Record<string, unknown>;
};

export type RestaurantTemplateStatus =
  | "approved"
  | "pending"
  | "received"
  | "rejected"
  | "paused"
  | "disabled"
  | "unsubmitted"
  | "absent"
  | "inconnu";

export type RestaurantTemplateReport = {
  nom: string;
  variable: string;
  content_sid: string | null;
  statut: RestaurantTemplateStatus;
  /** `env` : SID lu dans la variable ; `twilio` : retrouvé par son nom chez Twilio. */
  source: "env" | "twilio" | null;
  /** Vrai quand ce passage a créé le contenu. Faux : il existait déjà. */
  cree?: boolean;
  /** Vrai quand ce passage a déposé la demande d’approbation. */
  soumis?: boolean;
  motif_refus?: string | null;
  erreur?: string;
};

export function restaurantTemplateDrafts(): RestaurantTemplateDraft[] {
  return [
    { env: RESTAURANT_INTRO_ENV, friendlyName: RESTAURANT_INTRO_NAME, create: restaurantIntroContentCreateBody() },
    { env: RESTAURANT_CAROUSEL_ENV, friendlyName: RESTAURANT_CAROUSEL_NAME, create: restaurantCarouselContentCreateBody(false) },
    {
      env: RESTAURANT_CAROUSEL_MENU_ENV,
      friendlyName: RESTAURANT_CAROUSEL_MENU_NAME,
      create: restaurantCarouselContentCreateBody(true),
    },
  ];
}

function twilioAccount() {
  return {
    sid: productionOnlySecret(process.env.TWILIO_ACCOUNT_SID),
    token: productionOnlySecret(process.env.TWILIO_AUTH_TOKEN),
  };
}

export function restaurantTemplatesTwilioReady() {
  const { sid, token } = twilioAccount();
  return Boolean(sid && token);
}

/** Message d’erreur sans URL, sans numéro long, sans SID de compte ni jeton. */
export function quietTwilioError(error: unknown) {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "échec";
  const { sid, token } = twilioAccount();
  let message = raw.replace(/https?:\/\/\S+/g, "").replace(/\+?\d{8,}/g, "");
  if (sid) message = message.split(sid).join("");
  if (token) message = message.split(token).join("");
  return message.replace(/\s+/g, " ").trim().slice(0, 180) || "échec";
}

type TwilioPayload = {
  sid?: string;
  message?: string;
  contents?: { sid?: string; friendly_name?: string; date_created?: string }[];
  meta?: { next_page_url?: string | null };
  whatsapp?: { status?: string; rejection_reason?: string | null };
  status?: string;
} | null;

async function twilio(url: string, fetchImpl: typeof fetch, init?: RequestInit) {
  const { sid, token } = twilioAccount();
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => null)) as TwilioPayload;
  return { response, payload };
}

/** SID du contenu Twilio qui porte ce nom, le plus ancien si plusieurs. Null si aucun. */
async function findContentByName(name: string, fetchImpl: typeof fetch): Promise<string | null> {
  let page: string | null = `${CONTENT_URL}?PageSize=100`;
  let pages = 0;
  let found: { sid: string; created: string } | null = null;
  while (page && pages < MAX_PAGES) {
    pages += 1;
    const { response, payload } = await twilio(page, fetchImpl);
    if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
    for (const row of payload?.contents || []) {
      if (row.friendly_name !== name || !row.sid) continue;
      const created = row.date_created || "";
      if (!found || created < found.created) found = { sid: row.sid, created };
    }
    page = payload?.meta?.next_page_url || null;
  }
  return found?.sid || null;
}

async function createContent(body: Record<string, unknown>, fetchImpl: typeof fetch) {
  const { response, payload } = await twilio(CONTENT_URL, fetchImpl, { method: "POST", body: JSON.stringify(body) });
  if (!response.ok || !payload?.sid) throw new Error(payload?.message || `HTTP ${response.status}`);
  return payload.sid;
}

/** Vrai si la demande vient d’être déposée. Faux si elle existait déjà (ou si le modèle est déjà approuvé). */
async function submitApproval(sid: string, name: string, fetchImpl: typeof fetch) {
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}/ApprovalRequests/whatsapp`, fetchImpl, {
    method: "POST",
    body: JSON.stringify({ name, category: RESTAURANT_TEMPLATE_CATEGORY }),
  });
  if (response.ok) return true;
  const message = payload?.message || `HTTP ${response.status}`;
  if (/already|submitted|approved|exists|pending/i.test(message)) return false;
  throw new Error(message);
}

function normalizeStatus(raw: string | undefined | null): RestaurantTemplateStatus {
  const status = (raw || "").toLowerCase();
  if (!status) return "unsubmitted";
  if (["approved", "pending", "received", "rejected", "paused", "disabled", "unsubmitted"].includes(status)) {
    return status as RestaurantTemplateStatus;
  }
  return "inconnu";
}

async function readApproval(sid: string, fetchImpl: typeof fetch) {
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}/ApprovalRequests`, fetchImpl);
  if (response.status === 404) return { statut: "unsubmitted" as const, motif: null };
  if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
  return {
    statut: normalizeStatus(payload?.whatsapp?.status || payload?.status),
    motif: payload?.whatsapp?.rejection_reason || null,
  };
}

function envSid(env: string) {
  return productionOnlySecret(process.env[env]);
}

/**
 * Crée les modèles qui manquent, dépose la demande d’approbation WhatsApp (Utility), relit le statut.
 * Idempotent : un modèle qui porte déjà ce nom chez Twilio est repris, pas dupliqué.
 * N’envoie aucun message. Ne renvoie aucun secret.
 */
export async function ensureRestaurantTemplates(fetchImpl: typeof fetch = fetch): Promise<{
  ok: boolean;
  modeles: RestaurantTemplateReport[];
  message?: string;
}> {
  if (!restaurantTemplatesTwilioReady()) {
    return {
      ok: false,
      modeles: restaurantTemplateDrafts().map((draft) => ({
        nom: draft.friendlyName,
        variable: draft.env,
        content_sid: null,
        statut: "absent" as const,
        source: null,
      })),
      message: "Twilio n’est pas configuré sur ce serveur (TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN). Rien n’a été créé.",
    };
  }
  const modeles: RestaurantTemplateReport[] = [];
  for (const draft of restaurantTemplateDrafts()) {
    const report: RestaurantTemplateReport = {
      nom: draft.friendlyName,
      variable: draft.env,
      content_sid: null,
      statut: "absent",
      source: null,
      cree: false,
      soumis: false,
    };
    try {
      const fromEnv = envSid(draft.env);
      let sid = fromEnv || (await findContentByName(draft.friendlyName, fetchImpl));
      report.source = fromEnv ? "env" : sid ? "twilio" : null;
      if (!sid) {
        sid = await createContent(draft.create, fetchImpl);
        report.cree = true;
        report.source = "twilio";
      }
      report.content_sid = sid;
      const before = await readApproval(sid, fetchImpl);
      if (before.statut === "unsubmitted" || before.statut === "rejected" || before.statut === "inconnu") {
        report.soumis = await submitApproval(sid, draft.friendlyName, fetchImpl);
      }
      const after = report.soumis ? await readApproval(sid, fetchImpl) : before;
      report.statut = after.statut;
      report.motif_refus = after.motif;
      lookupCache.set(draft.friendlyName, { sid, at: Date.now() });
    } catch (error) {
      report.erreur = quietTwilioError(error);
    }
    modeles.push(report);
  }
  return { ok: modeles.every((row) => !row.erreur), modeles };
}

/** Statut d’approbation de chaque modèle, sans rien créer ni soumettre. */
export async function restaurantTemplatesStatus(fetchImpl: typeof fetch = fetch): Promise<{
  ok: boolean;
  modeles: RestaurantTemplateReport[];
  message?: string;
}> {
  const drafts = restaurantTemplateDrafts();
  if (!restaurantTemplatesTwilioReady()) {
    return {
      ok: false,
      modeles: drafts.map((draft) => ({
        nom: draft.friendlyName,
        variable: draft.env,
        content_sid: envSid(draft.env) || null,
        statut: "inconnu" as const,
        source: envSid(draft.env) ? ("env" as const) : null,
      })),
      message: "Twilio n’est pas configuré sur ce serveur : le statut ne peut pas être lu.",
    };
  }
  const modeles: RestaurantTemplateReport[] = [];
  for (const draft of drafts) {
    const report: RestaurantTemplateReport = {
      nom: draft.friendlyName,
      variable: draft.env,
      content_sid: null,
      statut: "absent",
      source: null,
    };
    try {
      const fromEnv = envSid(draft.env);
      const sid = fromEnv || (await findContentByName(draft.friendlyName, fetchImpl));
      if (sid) {
        report.content_sid = sid;
        report.source = fromEnv ? "env" : "twilio";
        const approval = await readApproval(sid, fetchImpl);
        report.statut = approval.statut;
        report.motif_refus = approval.motif;
      }
    } catch (error) {
      report.erreur = quietTwilioError(error);
    }
    modeles.push(report);
  }
  return { ok: modeles.every((row) => !row.erreur), modeles };
}

type LookupEntry = { sid: string | null; at: number };
const lookupCache = new Map<string, LookupEntry>();

export function clearRestaurantTemplateCache() {
  lookupCache.clear();
}

/**
 * SID à utiliser pour un modèle restaurant : la variable d’environnement (et sa variante _V2
 * approuvée) d’abord ; sinon le contenu Twilio qui porte le nom du modèle. Vide si rien n’existe.
 * Le nom est mis en cache dix minutes : le cron n’interroge pas Twilio à chaque passage.
 */
export async function resolveRestaurantContentSid(envName: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const fromEnv = await resolveContentSid(envName, fetchImpl);
  if (fromEnv) return fromEnv;
  const draft = restaurantTemplateDrafts().find((row) => row.env === envName);
  if (!draft || !restaurantTemplatesTwilioReady()) return "";
  const cached = lookupCache.get(draft.friendlyName);
  if (cached && Date.now() - cached.at < LOOKUP_CACHE_MS) return cached.sid || "";
  try {
    const sid = await findContentByName(draft.friendlyName, fetchImpl);
    lookupCache.set(draft.friendlyName, { sid, at: Date.now() });
    return sid || "";
  } catch {
    return cached?.sid || "";
  }
}

/** SID approuvé par Meta, sinon vide : l’envoi reste en file. */
export async function approvedRestaurantContentSid(envName: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const sid = await resolveRestaurantContentSid(envName, fetchImpl);
  if (!sid) return "";
  return (await whatsappContentApproved(sid, fetchImpl)) ? sid : "";
}
