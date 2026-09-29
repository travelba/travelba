import type { SupabaseClient } from "@supabase/supabase-js";
import { flightNoticeDrafts, type FlightNoticeKind } from "./flight-watch";
import { productionOnlySecret } from "./preview-secrets";

const CONTENT_URL = "https://content.twilio.com/v1/Content";

const KIND_BY_ENV: Record<string, FlightNoticeKind> = {
  TWILIO_CONTENT_VOL_HORAIRE: "horaire",
  TWILIO_CONTENT_VOL_ANNULE: "annule",
  TWILIO_CONTENT_VOL_ENREGISTREMENT: "enregistrement",
  TWILIO_CONTENT_VOL_RETARD: "retard",
  TWILIO_CONTENT_VOL_DEROUTE: "deroute",
  TWILIO_CONTENT_VOL_ENVOL: "envol",
  TWILIO_CONTENT_VOL_ARRIVEE: "arrivee",
};

type Extra = { notice_sids?: Partial<Record<FlightNoticeKind, string>> };

function quiet(error: unknown) {
  const message = error instanceof Error ? error.message : "échec";
  console.error(
    "[flight-notice]",
    message.replace(/https?:\/\/\S+/g, "").replace(/\+?\d{8,}/g, "").replace(/\s+/g, " ").trim().slice(0, 180)
  );
}

function twilioAccount() {
  return {
    sid: productionOnlySecret(process.env.TWILIO_ACCOUNT_SID),
    token: productionOnlySecret(process.env.TWILIO_AUTH_TOKEN),
  };
}

function authHeader() {
  const { sid, token } = twilioAccount();
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

function twilioReady() {
  const { sid, token } = twilioAccount();
  return Boolean(sid && token);
}

async function twilio(path: string, fetchImpl: typeof fetch, init?: RequestInit) {
  const response = await fetchImpl(path, {
    ...init,
    headers: {
      Authorization: authHeader(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    sid?: string;
    message?: string;
    contents?: { sid?: string; friendly_name?: string }[];
    meta?: { next_page_url?: string | null };
  } | null;
  return { response, payload };
}

async function findExisting(name: string, fetchImpl: typeof fetch) {
  let page: string | null = `${CONTENT_URL}?PageSize=50`;
  while (page) {
    const { response, payload } = await twilio(page, fetchImpl);
    if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
    const found = payload?.contents?.find((row) => row.friendly_name === name && row.sid);
    if (found?.sid) return found.sid;
    page = payload?.meta?.next_page_url || null;
  }
  return null;
}

async function createContent(body: unknown, fetchImpl: typeof fetch) {
  const { response, payload } = await twilio(CONTENT_URL, fetchImpl, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok || !payload?.sid) throw new Error(payload?.message || `HTTP ${response.status}`);
  return payload.sid;
}

async function submitApproval(sid: string, name: string, fetchImpl: typeof fetch) {
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}/ApprovalRequests/whatsapp`, fetchImpl, {
    method: "POST",
    body: JSON.stringify({ name, category: "UTILITY" }),
  });
  if (response.ok) return;
  const message = payload?.message || `HTTP ${response.status}`;
  if (/already|submitted|approved/i.test(message)) return;
  throw new Error(message);
}

/**
 * Crée les modèles de vol manquants et garde leur SID dans crm_integrations.
 * L’environnement prime. Sans Twilio, rien n’est créé.
 */
export async function ensureFlightNoticeSids(
  admin: SupabaseClient,
  fetchImpl: typeof fetch = fetch
): Promise<Partial<Record<FlightNoticeKind, string>>> {
  const resolved: Partial<Record<FlightNoticeKind, string>> = {};
  for (const draft of flightNoticeDrafts()) {
    const kind = KIND_BY_ENV[draft.env];
    const fromEnv = productionOnlySecret(process.env[draft.env]);
    if (kind && fromEnv) resolved[kind] = fromEnv;
  }
  const missing = flightNoticeDrafts().filter((draft) => {
    const kind = KIND_BY_ENV[draft.env];
    return kind && !resolved[kind];
  });
  if (!missing.length || !twilioReady()) return resolved;

  const { data } = await admin.from("crm_integrations").select("id, extra").eq("provider", "aeroapi").maybeSingle();
  const extra = ((data?.extra || {}) as Extra) || {};
  const stored: Partial<Record<FlightNoticeKind, string>> = { ...(extra.notice_sids || {}) };
  let changed = false;

  for (const draft of missing) {
    const kind = KIND_BY_ENV[draft.env];
    if (!kind) continue;
    if (stored[kind]) {
      resolved[kind] = stored[kind];
      continue;
    }
    try {
      const sid = (await findExisting(draft.friendlyName, fetchImpl)) || (await createContent(draft.create, fetchImpl));
      await submitApproval(sid, draft.friendlyName, fetchImpl);
      stored[kind] = sid;
      resolved[kind] = sid;
      changed = true;
    } catch (error) {
      quiet(error);
    }
  }

  if (changed) {
    const next = { ...(data?.extra || {}), notice_sids: stored };
    if (data?.id) {
      await admin.from("crm_integrations").update({ extra: next, updated_at: new Date().toISOString() }).eq("id", data.id);
    } else {
      await admin.from("crm_integrations").insert({ provider: "aeroapi", extra: next });
    }
  }
  return resolved;
}
