import { productionOnlySecret } from "./preview-secrets";
import { trainContentDrafts } from "./train-content";

const CONTENT_URL = "https://content.twilio.com/v1/Content";
export const TRAIN_TEMPLATE_CATEGORY = "UTILITY";

type Draft = ReturnType<typeof trainContentDrafts>[number];
type Status = "approved" | "pending" | "received" | "rejected" | "paused" | "disabled" | "unsubmitted" | "absent" | "inconnu";

export type TrainTemplateReport = {
  nom: string;
  variable: string;
  content_sid: string | null;
  statut: Status;
  source: "env" | "twilio" | null;
  cree?: boolean;
  soumis?: boolean;
  motif_refus?: string | null;
  erreur?: string;
};

function account() {
  return {
    sid: productionOnlySecret(process.env.TWILIO_ACCOUNT_SID),
    token: productionOnlySecret(process.env.TWILIO_AUTH_TOKEN),
  };
}

export function trainTemplatesTwilioReady() {
  return Boolean(account().sid && account().token);
}

function quiet(error: unknown) {
  const raw = error instanceof Error ? error.message : "échec";
  const { sid, token } = account();
  let message = raw.replace(/https?:\/\/\S+/g, "").replace(/\+?\d{8,}/g, "");
  if (sid) message = message.split(sid).join("");
  if (token) message = message.split(token).join("");
  return message.replace(/\s+/g, " ").trim().slice(0, 180) || "échec";
}

type Payload = {
  sid?: string;
  message?: string;
  contents?: { sid?: string; friendly_name?: string; date_created?: string }[];
  meta?: { next_page_url?: string | null };
  whatsapp?: { status?: string; rejection_reason?: string | null };
  status?: string;
  types?: {
    "twilio/quick-reply"?: { actions?: { title?: string }[] };
    "twilio/list-picker"?: { items?: { item?: string }[] };
  };
} | null;

/** Meta refuse { et } dans un titre de réponse rapide. Un modèle déjà créé ainsi est ignoré. */
export function trainReplyTitlesRejected(payload: Payload) {
  const actions = payload?.types?.["twilio/quick-reply"]?.actions || [];
  return actions.some((action) => /[{}]/.test(action.title || ""));
}

async function twilio(url: string, fetchImpl: typeof fetch, init?: RequestInit) {
  const { sid, token } = account();
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => null)) as Payload;
  return { response, payload };
}

function normalize(raw: string | undefined | null): Status {
  const status = (raw || "").toLowerCase();
  if (!status) return "unsubmitted";
  if (["approved", "pending", "received", "rejected", "paused", "disabled", "unsubmitted"].includes(status)) return status as Status;
  return "inconnu";
}

async function findByName(name: string, fetchImpl: typeof fetch) {
  let page: string | null = `${CONTENT_URL}?PageSize=100`;
  let found: { sid: string; created: string } | null = null;
  for (let i = 0; page && i < 20; i += 1) {
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

async function storedContent(sid: string, fetchImpl: typeof fetch) {
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}`, fetchImpl);
  if (!response.ok) return null;
  return payload;
}

async function approval(sid: string, fetchImpl: typeof fetch) {
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}/ApprovalRequests`, fetchImpl);
  if (response.status === 404) return { statut: "unsubmitted" as const, motif: null };
  if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
  return { statut: normalize(payload?.whatsapp?.status || payload?.status), motif: payload?.whatsapp?.rejection_reason || null };
}

function blank(draft: Draft, statut: Status): TrainTemplateReport {
  return { nom: draft.friendlyName, variable: draft.env, content_sid: null, statut, source: null };
}

export async function ensureTrainTemplates(fetchImpl: typeof fetch = fetch) {
  const drafts = trainContentDrafts();
  if (!trainTemplatesTwilioReady()) {
    return {
      ok: false,
      modeles: drafts.map((draft) => blank(draft, "absent")),
      message: "Twilio n’est pas configuré. Rien n’a été créé.",
    };
  }
  const modeles: TrainTemplateReport[] = [];
  for (const draft of drafts) {
    const report = blank(draft, "absent");
    try {
      const fromEnv = productionOnlySecret(process.env[draft.env]);
      let sid = fromEnv || (await findByName(draft.friendlyName, fetchImpl));
      const stored = sid ? await storedContent(sid, fetchImpl) : null;
      const list = !draft.approuver;
      if (sid && stored && list && !stored.types?.["twilio/list-picker"]) sid = "";
      if (sid && stored && !list && trainReplyTitlesRejected(stored)) sid = "";
      report.source = fromEnv && sid ? "env" : sid ? "twilio" : null;
      if (!sid) {
        const created = await twilio(CONTENT_URL, fetchImpl, { method: "POST", body: JSON.stringify(draft.create) });
        if (!created.response.ok || !created.payload?.sid) throw new Error(created.payload?.message || `HTTP ${created.response.status}`);
        sid = created.payload.sid;
        report.cree = true;
        report.source = "twilio";
      }
      report.content_sid = sid;
      if (!draft.approuver) {
        report.statut = "unsubmitted";
        report.soumis = false;
        modeles.push(report);
        continue;
      }
      let before = await approval(sid, fetchImpl);
      if (before.statut === "rejected") {
        const created = await twilio(CONTENT_URL, fetchImpl, { method: "POST", body: JSON.stringify(draft.create) });
        if (!created.response.ok || !created.payload?.sid) throw new Error(created.payload?.message || `HTTP ${created.response.status}`);
        sid = created.payload.sid;
        report.content_sid = sid;
        report.cree = true;
        report.source = "twilio";
        before = { statut: "unsubmitted", motif: null };
      }
      if (before.statut === "unsubmitted" || before.statut === "rejected" || before.statut === "inconnu") {
        const submitted = await twilio(`${CONTENT_URL}/${sid}/ApprovalRequests/whatsapp`, fetchImpl, {
          method: "POST",
          body: JSON.stringify({ name: draft.friendlyName, category: TRAIN_TEMPLATE_CATEGORY }),
        });
        report.soumis = submitted.response.ok;
        if (!submitted.response.ok && !/already|submitted|approved|exists|pending/i.test(submitted.payload?.message || "")) {
          throw new Error(submitted.payload?.message || `HTTP ${submitted.response.status}`);
        }
      }
      const after = report.soumis ? await approval(sid, fetchImpl) : before;
      report.statut = after.statut;
      report.motif_refus = after.motif;
    } catch (error) {
      report.erreur = quiet(error);
    }
    modeles.push(report);
  }
  return { ok: modeles.every((row) => !row.erreur), modeles };
}

export async function trainTemplatesStatus(fetchImpl: typeof fetch = fetch) {
  const drafts = trainContentDrafts();
  if (!trainTemplatesTwilioReady()) {
    return { ok: false, modeles: drafts.map((draft) => blank(draft, "inconnu")), message: "Twilio n’est pas configuré." };
  }
  const modeles: TrainTemplateReport[] = [];
  for (const draft of drafts) {
    const report = blank(draft, "absent");
    try {
      const fromEnv = productionOnlySecret(process.env[draft.env]);
      const sid = fromEnv || (await findByName(draft.friendlyName, fetchImpl));
      if (sid) {
        report.content_sid = sid;
        report.source = fromEnv ? "env" : "twilio";
        const read = await approval(sid, fetchImpl);
        report.statut = read.statut;
        report.motif_refus = read.motif;
      }
    } catch (error) {
      report.erreur = quiet(error);
    }
    modeles.push(report);
  }
  return { ok: modeles.every((row) => !row.erreur), modeles };
}
