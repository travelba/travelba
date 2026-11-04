import { accessContentDrafts } from "./access-resend";
import { hotelOptionContentDrafts } from "./hotel-option-whatsapp";
import { invoiceContentDraft } from "./invoice-document";
import { productionOnlySecret } from "./preview-secrets";
import { resolveContentSid } from "./twilio-content-sid";
import { visaGrantContentDrafts } from "./visa-grant-whatsapp";
import { isContentSid, serviceContentSidStore, type ContentSidStore } from "./whatsapp-content-sid-store";

/**
 * Dépôt des modèles WhatsApp d’accès et de facture chez Twilio, depuis le serveur.
 * Content API seulement. Aucun message. Le SID est écrit dans crm_whatsapp_content_sids.
 * L’envoi lit ce réglage, puis la variable d’environnement du même nom.
 */

const CONTENT_URL = "https://content.twilio.com/v1/Content";
export const AGENCY_TEMPLATE_CATEGORY = "UTILITY";
const MAX_PAGES = 20;

export type AgencyTemplateStatus =
  | "approved"
  | "pending"
  | "received"
  | "rejected"
  | "paused"
  | "disabled"
  | "unsubmitted"
  | "absent"
  | "inconnu";

export type AgencyTemplateReport = {
  nom: string;
  variable: string;
  content_sid: string | null;
  statut: AgencyTemplateStatus;
  /** reglage : base ; env : variable ; twilio : retrouvé par le nom. */
  source: "reglage" | "env" | "twilio" | null;
  cree?: boolean;
  soumis?: boolean;
  motif_refus?: string | null;
  erreur?: string;
};

type Draft = { env: string; friendlyName: string; create: Record<string, unknown> };

function asDrafts(rows: { env: string; friendlyName: string; create: object }[]): Draft[] {
  return rows.map((draft) => ({
    env: draft.env,
    friendlyName: draft.friendlyName,
    create: draft.create as Record<string, unknown>,
  }));
}

export function agencyTemplateDrafts(): Draft[] {
  return asDrafts([...accessContentDrafts(), ...hotelOptionContentDrafts(), invoiceContentDraft()]);
}

/** PDF et image de l’autorisation validée. Les exemples sont les URL de production. */
export function authorizationTemplateDrafts(): Draft[] {
  return asDrafts(visaGrantContentDrafts());
}

function twilioAccount() {
  return {
    sid: productionOnlySecret(process.env.TWILIO_ACCOUNT_SID),
    token: productionOnlySecret(process.env.TWILIO_AUTH_TOKEN),
  };
}

export function agencyTemplatesTwilioReady() {
  const { sid, token } = twilioAccount();
  return Boolean(sid && token);
}

export function quietAgencyTwilioError(error: unknown) {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "échec";
  const { sid, token } = twilioAccount();
  let message = raw;
  if (sid) message = message.split(sid).join("");
  if (token) message = message.split(token).join("");
  message = message.replace(/https?:\/\/\S+/g, "").replace(/\+?\d{8,}/g, "");
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

async function findContentByName(name: string, fetchImpl: typeof fetch) {
  let page: string | null = `${CONTENT_URL}?PageSize=100`;
  let pages = 0;
  let found: { sid: string; created: string } | null = null;
  while (page && pages < MAX_PAGES) {
    pages += 1;
    const { response, payload } = await twilio(page, fetchImpl);
    if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
    for (const row of payload?.contents || []) {
      if (row.friendly_name !== name || !isContentSid(row.sid)) continue;
      const created = row.date_created || "";
      if (!found || created < found.created) found = { sid: row.sid, created };
    }
    page = payload?.meta?.next_page_url || null;
  }
  return found?.sid || null;
}

async function createContent(body: Record<string, unknown>, fetchImpl: typeof fetch) {
  const { response, payload } = await twilio(CONTENT_URL, fetchImpl, { method: "POST", body: JSON.stringify(body) });
  if (!response.ok || !isContentSid(payload?.sid)) throw new Error(payload?.message || `HTTP ${response.status}`);
  return payload.sid;
}

async function submitApproval(sid: string, name: string, fetchImpl: typeof fetch) {
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}/ApprovalRequests/whatsapp`, fetchImpl, {
    method: "POST",
    body: JSON.stringify({ name, category: AGENCY_TEMPLATE_CATEGORY }),
  });
  if (response.ok) return true;
  const message = payload?.message || `HTTP ${response.status}`;
  if (/already|submitted|approved|exists|pending/i.test(message)) return false;
  throw new Error(message);
}

function normalizeStatus(raw: string | undefined | null): AgencyTemplateStatus {
  const status = (raw || "").toLowerCase();
  if (!status) return "unsubmitted";
  if (["approved", "pending", "received", "rejected", "paused", "disabled", "unsubmitted"].includes(status)) {
    return status as AgencyTemplateStatus;
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
  const value = productionOnlySecret(process.env[env]);
  return isContentSid(value) ? value : "";
}

/**
 * Un SID déjà enregistré ne sert que s’il porte le nom du brouillon.
 * Un nom refusé (`acces_client`) ne bloque pas le nouveau (`espace_client_lien`).
 */
async function chooseExistingSid(draft: Draft, fetchImpl: typeof fetch, store: ContentSidStore) {
  const storedSid = await store.read(draft.env);
  const storedName = await store.readName(draft.env);
  if (storedSid && (!storedName || storedName === draft.friendlyName)) {
    return { sid: storedSid, source: "reglage" as const };
  }
  const fromEnv = envSid(draft.env);
  if (fromEnv && fromEnv !== storedSid) return { sid: fromEnv, source: "env" as const };
  const found = await findContentByName(draft.friendlyName, fetchImpl);
  return { sid: found, source: found ? ("twilio" as const) : null };
}

async function remember(store: ContentSidStore, env: string, sid: string, name: string) {
  const current = await store.read(env);
  if (current === sid) return;
  await store.write(env, sid, name);
}

/**
 * SID d’envoi : le réglage en base d’abord, puis la variable (et sa variante _V2 approuvée).
 * Vide si les deux manquent. N’appelle pas Twilio pour chercher par nom.
 */
export async function resolveAgencyContentSid(
  envName: string,
  fetchImpl: typeof fetch = fetch,
  store: ContentSidStore = serviceContentSidStore()
) {
  try {
    const stored = await store.read(envName);
    if (stored) return stored;
  } catch {
    /* Le repli est la variable. */
  }
  return (await resolveContentSid(envName, fetchImpl)) || "";
}

export async function ensureAgencyTemplates(
  fetchImpl: typeof fetch = fetch,
  store: ContentSidStore = serviceContentSidStore()
) {
  return ensureTemplateDrafts(agencyTemplateDrafts(), fetchImpl, store);
}

/** Dépose les v2 (nom de l’autorisation) et conserve les v1. Aucun message. */
export async function ensureAuthorizationTemplates(
  fetchImpl: typeof fetch = fetch,
  store: ContentSidStore = serviceContentSidStore()
) {
  return ensureTemplateDrafts(authorizationTemplateDrafts(), fetchImpl, store);
}

async function ensureTemplateDrafts(
  drafts: Draft[],
  fetchImpl: typeof fetch,
  store: ContentSidStore
): Promise<{ ok: boolean; modeles: AgencyTemplateReport[]; message?: string }> {
  if (!agencyTemplatesTwilioReady()) {
    return {
      ok: false,
      modeles: drafts.map((draft) => ({
        nom: draft.friendlyName,
        variable: draft.env,
        content_sid: null,
        statut: "absent" as const,
        source: null,
      })),
      message: "Twilio n’est pas configuré sur ce serveur (TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN). Rien n’a été créé.",
    };
  }
  const modeles: AgencyTemplateReport[] = [];
  for (const draft of drafts) {
    const report: AgencyTemplateReport = {
      nom: draft.friendlyName,
      variable: draft.env,
      content_sid: null,
      statut: "absent",
      source: null,
      cree: false,
      soumis: false,
    };
    try {
      const existing = await chooseExistingSid(draft, fetchImpl, store);
      let sid = existing.sid;
      report.source = existing.source;
      if (!sid) {
        sid = await createContent(draft.create, fetchImpl);
        report.cree = true;
        report.source = "twilio";
      }
      report.content_sid = sid;
      await remember(store, draft.env, sid, draft.friendlyName);
      const before = await readApproval(sid, fetchImpl);
      if (before.statut === "unsubmitted" || before.statut === "rejected" || before.statut === "inconnu") {
        report.soumis = await submitApproval(sid, draft.friendlyName, fetchImpl);
      }
      const after = report.soumis ? await readApproval(sid, fetchImpl) : before;
      report.statut = after.statut;
      report.motif_refus = after.motif;
    } catch (error) {
      report.erreur = quietAgencyTwilioError(error);
    }
    modeles.push(report);
  }
  return { ok: modeles.every((row) => !row.erreur), modeles };
}

export async function agencyTemplatesStatus(
  fetchImpl: typeof fetch = fetch,
  store: ContentSidStore = serviceContentSidStore()
) {
  return templateDraftsStatus(agencyTemplateDrafts(), fetchImpl, store);
}

export async function authorizationTemplatesStatus(
  fetchImpl: typeof fetch = fetch,
  store: ContentSidStore = serviceContentSidStore()
) {
  return templateDraftsStatus(authorizationTemplateDrafts(), fetchImpl, store);
}

async function templateDraftsStatus(
  drafts: Draft[],
  fetchImpl: typeof fetch,
  store: ContentSidStore
): Promise<{ ok: boolean; modeles: AgencyTemplateReport[]; message?: string }> {
  if (!agencyTemplatesTwilioReady()) {
    const modeles: AgencyTemplateReport[] = [];
    for (const draft of drafts) {
      const stored = await store.read(draft.env).catch(() => null);
      const fromEnv = envSid(draft.env);
      modeles.push({
        nom: draft.friendlyName,
        variable: draft.env,
        content_sid: stored || fromEnv || null,
        statut: "inconnu",
        source: stored ? "reglage" : fromEnv ? "env" : null,
      });
    }
    return {
      ok: false,
      modeles,
      message: "Twilio n’est pas configuré sur ce serveur : le statut ne peut pas être lu.",
    };
  }
  const modeles: AgencyTemplateReport[] = [];
  for (const draft of drafts) {
    const report: AgencyTemplateReport = {
      nom: draft.friendlyName,
      variable: draft.env,
      content_sid: null,
      statut: "absent",
      source: null,
    };
    try {
      const existing = await chooseExistingSid(draft, fetchImpl, store);
      const sid = existing.sid;
      if (sid) {
        report.content_sid = sid;
        report.source = existing.source;
        const approval = await readApproval(sid, fetchImpl);
        report.statut = approval.statut;
        report.motif_refus = approval.motif;
        if (existing.source !== "reglage") await remember(store, draft.env, sid, draft.friendlyName);
      }
    } catch (error) {
      report.erreur = quietAgencyTwilioError(error);
    }
    modeles.push(report);
  }
  return { ok: modeles.every((row) => !row.erreur), modeles };
}
