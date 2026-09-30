import type { SupabaseClient } from "@supabase/supabase-js";
import { conciergeContentDrafts, conciergeContentSid, type ConciergeTemplate } from "./concierge-notices";
import { flightNoticeDrafts } from "./flight-watch";
import { isVercelPreview } from "./preview-secrets";
import { siteConfig } from "../site";
import { connexionContentSid, connexionContentVariables, sendContentTemplate, whatsappAddress } from "./whatsapp";
import { sendWhatsappSession, whatsappSessionConfigured } from "./whatsapp-session";
import { whatsappCatalog } from "./whatsapp-catalog";

/** Ligne de l’agence pour relire les messages. Déjà utilisée par les exemples de vol. */
const SAMPLE_PHONE = "0772158257";
const PROVIDER = "whatsapp_samples";

type Extra = {
  sent?: Record<string, string>;
  done_at?: string;
};

export type CatalogSample = {
  id: string;
  body: string;
  image: string | null;
  modelName: string | null;
};

/** Un exemplaire de chaque message qui part. Pas les textes encore sans envoi. */
export function catalogSamples(): CatalogSample[] {
  return whatsappCatalog()
    .filter((group) => group.id !== "attente")
    .flatMap((group) => group.messages)
    .filter((message) => message.wired)
    .map((message) => ({
      id: message.id,
      body: message.bubble.body,
      image: message.bubble.image,
      modelName: message.bubble.modelName,
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
  deliverTemplate: typeof sendContentTemplate = sendContentTemplate
) {
  if (isVercelPreview() || !whatsappSessionConfigured()) return { skipped: "not_configured" as const };
  const to = whatsappAddress(SAMPLE_PHONE);
  if (!to) return { skipped: "no_phone" as const };

  const { data } = await admin.from("crm_integrations").select("id, extra").eq("provider", PROVIDER).maybeSingle();
  const extra = ((data?.extra || {}) as Extra) || {};
  if (extra.done_at) return { skipped: "done" as const };
  const live = await imageLive(`${siteConfig.url}/whatsapp/hotel.jpg`, fetchImpl);
  if (!live) return { skipped: "images_offline" as const };

  const samples = catalogSamples();
  const sent: Record<string, string> = { ...(extra.sent || {}) };
  let sessionOpen: boolean | null = null;
  const mediaOk = new Map<string, boolean>();

  const save = async () => {
    const finished = samples.every((sample) => sent[sample.id] && sent[sample.id] !== "attente");
    const next: Extra = { sent, ...(finished ? { done_at: new Date().toISOString() } : {}) };
    await admin.from("crm_integrations").upsert(
      { provider: PROVIDER, extra: next, updated_at: new Date().toISOString() },
      { onConflict: "provider" }
    );
    return finished;
  };

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

    const draft = draftVariables(sample.modelName);
    if (draft?.sid && draft.variables) {
      const template = await deliverTemplate({
        phone: SAMPLE_PHONE,
        contentSid: draft.sid,
        variables: draft.variables,
        fetchImpl,
      });
      sent[sample.id] = template.ok ? "modele" : "refuse";
      await save();
      continue;
    }
    sent[sample.id] = sessionOpen === false ? "attente" : "refuse";
    await save();
  }

  const done = samples.every((sample) => sent[sample.id] && sent[sample.id] !== "attente");
  const delivered = Object.values(sent).filter((value) => value === "session" || value === "modele").length;
  return { skipped: null, delivered, total: samples.length, done };
}
