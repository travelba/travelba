import type { SupabaseClient } from "@supabase/supabase-js";
import { conciergeContentDrafts, conciergeContentSid, type ConciergeTemplate } from "./concierge-notices";
import { flightNoticeDrafts } from "./flight-watch";
import { isVercelPreview } from "./preview-secrets";
import { siteConfig } from "../site";
import { connexionContentSid, connexionContentVariables, sendContentTemplate, whatsappAddress } from "./whatsapp";
import { sendWhatsappSession, whatsappSessionConfigured } from "./whatsapp-session";
import { whatsappCatalog } from "./whatsapp-catalog";

/** Ligne de relecture des échantillons (WHATSAPP_SAMPLE_PHONE). Vide = aucun envoi d’échantillon. */
function samplePhone() {
  return (process.env.WHATSAPP_SAMPLE_PHONE || "").trim();
}
const PROVIDER = "whatsapp_samples";

type Extra = {
  sent?: Record<string, string>;
  done_at?: string;
  hold?: boolean;
  receipt?: DeliveryReport;
};

export type DeliveryReport = {
  total: number;
  delivered: number;
  errors: string[];
  statuses: Record<string, number>;
};

const UNREACHABLE = new Set(["63003", "21211", "21614", "63024"]);

const EMPTY_RECEIPT: DeliveryReport = { total: 0, delivered: 0, errors: [], statuses: {} };

/** Statuts Twilio des derniers messages vers le téléphone, sans corps ni numéro. */
export async function inspectSampleDelivery(to: string, fetchImpl: typeof fetch): Promise<DeliveryReport> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !token) return EMPTY_RECEIPT;
  try {
    const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`);
    url.searchParams.set("To", to);
    url.searchParams.set("PageSize", "50");
    const response = await fetchImpl(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return EMPTY_RECEIPT;
    const payload = (await response.json()) as {
      messages?: Array<{ status?: string; error_code?: number | null }>;
    };
    const statuses: Record<string, number> = {};
    const errors = new Set<string>();
    let delivered = 0;
    for (const message of payload.messages || []) {
      const status = message.status || "inconnu";
      statuses[status] = (statuses[status] || 0) + 1;
      if (status === "delivered" || status === "read") delivered += 1;
      if (message.error_code) errors.add(String(message.error_code));
    }
    return { total: Object.values(statuses).reduce((sum, count) => sum + count, 0), delivered, errors: [...errors], statuses };
  } catch {
    return EMPTY_RECEIPT;
  }
}

function sessionMissed(report: DeliveryReport) {
  if (report.errors.includes("63016") || report.errors.includes("470")) return true;
  const failed = (report.statuses.undelivered || 0) + (report.statuses.failed || 0);
  return failed > 0 && report.delivered === 0;
}

export type CatalogSample = {
  id: string;
  body: string;
  image: string | null;
  modelName: string | null;
  fallbackName: string | null;
  earlierName: string | null;
};

/** Un exemplaire de chaque message du récapitulatif, y compris ceux encore sans déclencheur. */
export function catalogSamples(): CatalogSample[] {
  return whatsappCatalog()
    .flatMap((group) => group.messages)
    .map((message) => ({
      id: message.id,
      body: message.bubble.body,
      image: message.bubble.image,
      modelName: message.bubble.modelName,
      fallbackName: message.fallback?.modelName ?? null,
      earlierName: message.earlier?.modelName ?? null,
    }));
}

export function sampleMediaUrl(image: string | null) {
  if (!image) return null;
  if (image.startsWith("/whatsapp/")) return `${siteConfig.url}${image}`;
  if (image.startsWith("https://") && image.includes("/api/covers/sejour/")) return image;
  if (image.startsWith("https://") && image.includes("/whatsapp/")) return image;
  return null;
}

function windowClosed(detail: string | undefined) {
  return /window|template|fenêtre/i.test(detail || "");
}

function draftVariables(modelName: string | null) {
  if (!modelName) return null;
  if (modelName === "connexion_espace") {
    return {
      sid: connexionContentSid(),
      variables: connexionContentVariables("Camille", `${siteConfig.url}/e/c/23456789`),
    };
  }
  const concierge = conciergeContentDrafts().find((draft) => draft.friendlyName === modelName);
  if (concierge) {
    return {
      sid: conciergeContentSid(concierge.template as ConciergeTemplate),
      variables: concierge.create.variables,
    };
  }
  const flight = flightNoticeDrafts().find((draft) => draft.friendlyName === modelName);
  if (!flight) return null;
  const sid = (process.env[flight.env] || "").trim();
  return { sid, variables: flight.create.variables };
}

function approvedDraft(sample: CatalogSample) {
  for (const name of [sample.modelName, sample.fallbackName, sample.earlierName]) {
    const draft = draftVariables(name);
    if (draft?.sid && draft.variables) return draft;
  }
  return null;
}

async function imageLive(url: string, fetchImpl: typeof fetch) {
  try {
    const response = await fetchImpl(url, { method: "HEAD", signal: AbortSignal.timeout(8_000) });
    const type = response.headers.get("content-type") || "";
    return response.ok && type.startsWith("image/");
  } catch {
    return false;
  }
}

/**
 * Envoie une fois chaque message du récapitulatif sur le téléphone de relecture.
 * L’image part dans la conversation si elle est ouverte. Sinon le modèle déjà approuvé part.
 * Tant que les images ne répondent pas sur travelba.fr, rien ne part.
 */
export async function sendCatalogSamples(
  admin: SupabaseClient,
  fetchImpl: typeof fetch = fetch,
  deliverSession: typeof sendWhatsappSession = sendWhatsappSession,
  deliverTemplate: typeof sendContentTemplate = sendContentTemplate,
  inspect: (to: string) => Promise<DeliveryReport> = (to) => inspectSampleDelivery(to, fetchImpl)
) {
  if (isVercelPreview() || !whatsappSessionConfigured()) return { skipped: "not_configured" as const };
  const to = whatsappAddress(samplePhone());
  if (!to) return { skipped: "no_phone" as const };

  const { data } = await admin.from("crm_integrations").select("id, extra").eq("provider", PROVIDER).maybeSingle();
  const extra = ((data?.extra || {}) as Extra) || {};
  const samples = catalogSamples();
  const replay = Boolean(extra.hold);
  const sent: Record<string, string> = replay ? {} : { ...(extra.sent || {}) };
  const pending = samples.some((sample) => !sent[sample.id] || sent[sample.id] === "attente");
  if (!pending) return { skipped: "done" as const };
  let receipt = extra.receipt || EMPTY_RECEIPT;
  if (replay || sessionMissed(receipt)) receipt = await inspect(to);
  let sessionOpen: boolean | null = sessionMissed(receipt) ? false : null;
  const mediaOk = new Map<string, boolean>();

  const save = async () => {
    const finished = samples.every((sample) => sent[sample.id] && sent[sample.id] !== "attente");
    const next: Extra = { sent, receipt, ...(finished ? { done_at: new Date().toISOString() } : {}) };
    await admin.from("crm_integrations").upsert(
      { provider: PROVIDER, extra: next, updated_at: new Date().toISOString() },
      { onConflict: "provider" }
    );
    return finished;
  };

  if (sessionMissed(receipt) && receipt.errors.some((code) => UNREACHABLE.has(code))) {
    for (const sample of samples) sent[sample.id] = "refuse";
    await save();
    return { skipped: null, delivered: 0, total: samples.length, done: true };
  }

  if (sessionOpen !== false) {
    const live = await imageLive(`${siteConfig.url}/whatsapp/hotel.jpg`, fetchImpl);
    if (!live) return { skipped: "images_offline" as const };
  }

  for (const sample of samples) {
    if (sent[sample.id] && sent[sample.id] !== "attente") continue;
    const media = sampleMediaUrl(sample.image);
    let mediaUrl: string | null = null;
    if (media) {
      if (!mediaOk.has(media)) mediaOk.set(media, await imageLive(media, fetchImpl));
      if (mediaOk.get(media)) mediaUrl = media;
    }

    if (sessionOpen !== false) {
      const session = await deliverSession({ to, body: sample.body, mediaUrl, fetchImpl });
      if (session.ok) {
        sent[sample.id] = "session";
        sessionOpen = true;
        await save();
        continue;
      }
      if (windowClosed(session.detail)) sessionOpen = false;
      if (!sample.modelName) {
        sent[sample.id] = "attente";
        await save();
        continue;
      }
    }

    const draft = approvedDraft(sample);
    if (draft?.sid && draft.variables) {
      const template = await deliverTemplate({
        phone: samplePhone(),
        contentSid: draft.sid,
        variables: draft.variables,
        fetchImpl,
      });
      const limited = /rate|63018|limit/i.test(template.ok ? "" : template.detail || "");
      sent[sample.id] = template.ok ? "modele" : limited ? "attente" : "refuse";
      await save();
      if (!template.ok && limited) await new Promise((resolve) => setTimeout(resolve, 2_000));
      continue;
    }
    sent[sample.id] = sessionOpen === false ? "attente" : "refuse";
    await save();
  }

  const done = samples.every((sample) => sent[sample.id] && sent[sample.id] !== "attente");
  const delivered = Object.values(sent).filter((value) => value === "session" || value === "modele").length;
  return { skipped: null, delivered, total: samples.length, done };
}
