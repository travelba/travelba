import { conciergeContentDrafts } from "./concierge-notices";
import { flightNoticeDrafts } from "./flight-watch";
import { connexionContentCreateBody } from "./whatsapp";
import { productionOnlySecret } from "./preview-secrets";
import { contentSidV2Name } from "./twilio-content-sid";
import { twilioApiSecret, twilioApiUser } from "./twilio-auth";

const CONTENT_URL = "https://content.twilio.com/v1/Content";

const PREPOSITION_BEFORE_SLOT = /(à|au|aux|en)\s+\{\{(\d+)\}\}/giu;

export type ContentDraft = {
  env: string;
  friendlyName: string;
  create: {
    friendly_name: string;
    language: string;
    variables: Record<string, string>;
    types: Record<string, unknown>;
  };
};

export type PrepositionTemplateReport = {
  env: string | null;
  friendlyName: string;
  newName: string;
  oldSid: string;
  newSid: string;
  approval: string;
};

type TwilioContent = {
  sid?: string;
  friendly_name?: string;
  language?: string;
  variables?: Record<string, string>;
  types?: Record<string, unknown>;
};

type TwilioPage = {
  contents?: TwilioContent[];
  meta?: { next_page_url?: string | null };
  message?: string;
  sid?: string;
  whatsapp?: { status?: string };
  status?: string;
};

function account() {
  return {
    sid: productionOnlySecret(process.env.TWILIO_ACCOUNT_SID),
    token: productionOnlySecret(twilioApiSecret()),
  };
}

export function twilioContentConfigured() {
  const { sid, token } = account();
  return Boolean(sid && token);
}

function authHeader() {
  const { sid, token } = account();
  return `Basic ${Buffer.from(`${twilioApiUser(sid)}:${token}`).toString("base64")}`;
}

async function twilio(path: string, fetchImpl: typeof fetch, init?: RequestInit) {
  if (/\/Messages/i.test(path)) throw new Error("envoi interdit");
  const response = await fetchImpl(path, {
    ...init,
    headers: {
      Authorization: authHeader(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as TwilioPage | null;
  return { response, payload };
}

export function contentBodies(types: Record<string, unknown> | null | undefined) {
  if (!types) return [];
  const bodies: string[] = [];
  for (const value of Object.values(types)) {
    if (!value || typeof value !== "object" || !("body" in value)) continue;
    const body = (value as { body?: unknown }).body;
    if (typeof body === "string" && body.trim()) bodies.push(body);
  }
  return bodies;
}

function isClock(value: string) {
  return /\d{1,2}h\d{2}/.test(value);
}

/** La variable porte une destination, pas une heure, un code ou un prénom. */
export function slotIsDestination(body: string, slot: string, sample: string) {
  if (new RegExp(`séjour\\s+(?:à|au|aux|en)\\s+\\{\\{${slot}\\}\\}`, "iu").test(body)) return true;
  const value = sample.trim();
  if (!value || isClock(value)) return false;
  if (/^c\//.test(value) || /^https?:/i.test(value) || /→/.test(value)) return false;
  if (/^[A-Z0-9]{2,3}\s?\d{2,5}$/.test(value)) return false;
  if (/^(camille|voyageur|esta|visa|eta|eta-il)$/i.test(value)) return false;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
  if (/^(à|au|aux|en)\s+\S/u.test(value)) return true;
  if (/réservation/i.test(value)) return true;
  return /^[\p{L}][\p{L}\s'’.-]{1,48}$/u.test(value);
}

/** Emplacements dont la préposition est encore écrite dans le corps. */
export function hardcodedDestinationSlots(body: string, variables: Record<string, string> = {}) {
  const slots = new Set<string>();
  for (const match of body.matchAll(PREPOSITION_BEFORE_SLOT)) {
    const slot = match[2];
    if (slot && slotIsDestination(body, slot, variables[slot] || "")) slots.add(slot);
  }
  return [...slots];
}

export function draftCatalog(): ContentDraft[] {
  const connexion: ContentDraft = {
    env: "TWILIO_CONTENT_CONNEXION",
    friendlyName: "connexion_espace",
    create: connexionContentCreateBody(),
  };
  return [...conciergeContentDrafts(), ...flightNoticeDrafts(), connexion];
}

function rewriteTypes(types: Record<string, unknown>, slots: Set<string>) {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(types)) {
    if (!value || typeof value !== "object" || !("body" in value) || typeof (value as { body?: unknown }).body !== "string") {
      next[key] = value;
      continue;
    }
    const body = (value as { body: string }).body.replace(
      new RegExp(`(?:à|au|aux|en)\\s+(\\{\\{(?:${[...slots].join("|")})\\}\\})`, "giu"),
      "$1"
    );
    next[key] = { ...value, body };
  }
  return next;
}

function prefixSample(sample: string) {
  const value = sample.trim();
  if (/^(à|au|aux|en)\s+\S/u.test(value)) return value;
  return `à ${value}`;
}

function versionName(friendlyName: string) {
  return /_v\d+$/.test(friendlyName) ? friendlyName : `${friendlyName}_v2`;
}

async function listContents(fetchImpl: typeof fetch) {
  const rows: TwilioContent[] = [];
  let page: string | null = `${CONTENT_URL}?PageSize=50`;
  while (page) {
    const { response, payload } = await twilio(page, fetchImpl);
    if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
    rows.push(...(payload?.contents || []));
    page = payload?.meta?.next_page_url || null;
  }
  return rows;
}

async function loadContent(sid: string, listed: TwilioContent | undefined, fetchImpl: typeof fetch) {
  if (listed?.types && contentBodies(listed.types).length) return listed;
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}`, fetchImpl);
  if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
  return payload as TwilioContent;
}

async function approvalStatus(sid: string, fetchImpl: typeof fetch) {
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}/ApprovalRequests`, fetchImpl);
  if (!response.ok) return "inconnu";
  return (payload?.whatsapp?.status || payload?.status || "inconnu").toLowerCase();
}

async function submitApproval(sid: string, name: string, fetchImpl: typeof fetch) {
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}/ApprovalRequests/whatsapp`, fetchImpl, {
    method: "POST",
    body: JSON.stringify({ name, category: "UTILITY" }),
  });
  if (response.ok) return approvalStatus(sid, fetchImpl);
  const message = payload?.message || "";
  if (/already|submitted|approved/i.test(message)) return approvalStatus(sid, fetchImpl);
  throw new Error(message || `HTTP ${response.status}`);
}

function envForSid(sid: string, drafts: ContentDraft[]) {
  for (const draft of drafts) {
    if (productionOnlySecret(process.env[draft.env]) === sid) return draft.env;
    if (productionOnlySecret(process.env[contentSidV2Name(draft.env)]) === sid) return draft.env;
  }
  return null;
}

function draftForName(name: string, drafts: ContentDraft[]) {
  const bare = name.replace(/_v\d+$/, "");
  return drafts.find((draft) => draft.friendlyName === name || draft.friendlyName === bare) || null;
}

/**
 * Nouvelle version des modèles dont le corps approuvé écrit encore la préposition
 * devant la destination. L’ancien contenu reste en place. Aucun message n’est envoyé.
 */
export async function resubmitPrepositionTemplates(
  fetchImpl: typeof fetch = fetch
): Promise<PrepositionTemplateReport[]> {
  if (!twilioContentConfigured()) return [];
  const drafts = draftCatalog();
  const listed = await listContents(fetchImpl);
  const byName = new Map(listed.filter((row) => row.friendly_name && row.sid).map((row) => [row.friendly_name as string, row]));
  const reports: PrepositionTemplateReport[] = [];
  const seen = new Set<string>();

  for (const row of listed) {
    const oldSid = row.sid?.trim() || "";
    const friendlyName = row.friendly_name?.trim() || "";
    if (!oldSid || !friendlyName || seen.has(oldSid)) continue;
    if (/_v\d+$/.test(friendlyName)) continue;
    const full = await loadContent(oldSid, row, fetchImpl);
    const variables = full.variables || {};
    const bodies = contentBodies(full.types);
    const slots = new Set(bodies.flatMap((body) => hardcodedDestinationSlots(body, variables)));
    if (!slots.size) continue;
    seen.add(oldSid);
    const newName = versionName(friendlyName);
    const draft = draftForName(friendlyName, drafts);
    const existing = byName.get(newName);
    let newSid = existing?.sid?.trim() || "";
    if (!newSid) {
      const create = draft
        ? { ...draft.create, friendly_name: newName }
        : {
            friendly_name: newName,
            language: full.language || "fr",
            variables: Object.fromEntries(
              Object.entries(variables).map(([key, value]) => [key, slots.has(key) ? prefixSample(value) : value])
            ),
            types: rewriteTypes(full.types || {}, slots),
          };
      const { response, payload } = await twilio(CONTENT_URL, fetchImpl, {
        method: "POST",
        body: JSON.stringify(create),
      });
      if (!response.ok || !payload?.sid) throw new Error(payload?.message || `HTTP ${response.status}`);
      newSid = payload.sid;
    }
    const approval = await submitApproval(newSid, newName, fetchImpl);
    reports.push({
      env: draft?.env || envForSid(oldSid, drafts),
      friendlyName,
      newName,
      oldSid,
      newSid,
      approval,
    });
  }
  return reports;
}
