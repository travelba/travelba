/**
 * WhatsApp Business via Twilio — Travel Business Agency.
 *
 * Plan de messages type :
 *   1) Opt-in Concierge (quick-reply Oui / Non merci) — TWILIO_WHATSAPP_OPTIN_CONTENT_SID
 *   2) Dossier voyage (devis + app) — après « Oui », via TWILIO_WHATSAPP_CONTENT_SID
 *
 * Requis :
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM — ex. whatsapp:+33756841315
 *
 * Fortement recommandé (1er contact / hors fenêtre 24h) :
 *   TWILIO_WHATSAPP_CONTENT_SID — Content template HX…
 *   Défaut TBA : concierge_note_fr (HX3b905c38a13cb93104ddfd49a414a420) → {{1}} = corps du message
 *   TWILIO_WHATSAPP_OPTIN_CONTENT_SID — tba_concierge_optin_dossier_fr_v1 (boutons)
 *   TWILIO_WHATSAPP_DOSSIER_CONTENT_SID — tba_concierge_dossier_liens_fr_v1 ({{1}} prénom, {{2}} dépenses, {{3}} My Trip)
 *
 * Optionnel :
 *   TWILIO_MESSAGING_SERVICE_SID
 *   TWILIO_WHATSAPP_DISPLAY_NUMBER
 */
import { siteConfig } from "@/lib/site";

/** Template texte TBA déjà approuvé : « Message de votre conciergerie… {{1}} » */
export const DEFAULT_TWILIO_CONTENT_SID =
  "HX3b905c38a13cb93104ddfd49a414a420";

/** Opt-in Concierge + boutons Oui / Non merci (approbation Meta requise). */
export const DEFAULT_TWILIO_OPTIN_CONTENT_SID =
  "HX9a732d2ec7e574fab0d4e2d84e1d36ba";

/** Dossier : prénom + 2 liens courts (approbation Meta requise). */
export const DEFAULT_TWILIO_DOSSIER_CONTENT_SID =
  "HX6a80c8f6ac549cdab65f9066b0448e5c";

export function normalizeWhatsAppDigits(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `33${digits.slice(1)}`;
  }
  if (digits.length < 8) return null;
  return digits;
}

function toWhatsAppAddress(phoneOrWa: string): string {
  const raw = phoneOrWa.trim();
  if (raw.toLowerCase().startsWith("whatsapp:")) return raw;
  const digits = normalizeWhatsAppDigits(raw);
  if (!digits) throw new Error("Numéro WhatsApp invalide");
  return `whatsapp:+${digits}`;
}

/** Vercel paste sometimes stores `NAME=value` as the value. */
export function readEnv(name: string, fallback = ""): string {
  let v = (process.env[name] || fallback || "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  const prefix = `${name}=`;
  if (v.startsWith(prefix)) v = v.slice(prefix.length).trim();
  return v;
}

export function getWhatsAppBusinessConfig() {
  let accountSid = readEnv("TWILIO_ACCOUNT_SID");
  const sidMatch = accountSid.match(/AC[0-9a-f]{32}/i);
  if (sidMatch) accountSid = sidMatch[0];
  const authToken = readEnv("TWILIO_AUTH_TOKEN");
  const fromRaw =
    readEnv("TWILIO_WHATSAPP_FROM") ||
    readEnv("TWILIO_WHATSAPP_NUMBER");
  const messagingServiceSid = readEnv("TWILIO_MESSAGING_SERVICE_SID");
  const contentSid =
    readEnv("TWILIO_WHATSAPP_CONTENT_SID") || DEFAULT_TWILIO_CONTENT_SID;
  const optinContentSid =
    readEnv("TWILIO_WHATSAPP_OPTIN_CONTENT_SID") ||
    DEFAULT_TWILIO_OPTIN_CONTENT_SID;
  const dossierContentSid = readEnv("TWILIO_WHATSAPP_DOSSIER_CONTENT_SID");
  const displayNumber = (
    readEnv("TWILIO_WHATSAPP_DISPLAY_NUMBER") ||
    readEnv("WHATSAPP_DISPLAY_NUMBER") ||
    siteConfig.whatsappNumber
  ).replace(/\D/g, "");

  let from = "";
  try {
    if (fromRaw) from = toWhatsAppAddress(fromRaw);
  } catch {
    from = "";
  }

  const configured = Boolean(
    accountSid && authToken && (from || messagingServiceSid)
  );

  return {
    accountSid,
    authToken,
    from,
    messagingServiceSid,
    contentSid,
    optinContentSid,
    dossierContentSid,
    displayNumber,
    configured,
    label: siteConfig.name,
    provider: "twilio" as const,
  };
}

/** Message 1 — Opt-in Concierge (texte de référence ; les boutons sont sur le template). */
export function buildConciergeOptInMessage(firstName: string) {
  const prenom = (firstName || "voyageur").trim() || "voyageur";
  return [
    `Bonjour ${prenom},`,
    "Je suis Le Concierge de Travel Business Agency, je suis là pour t'accompagner (info pratique, rappels utiles, réponses à vos questions) pendant ton séjour.",
    "Veux-tu recevoir ton dossier voyage ?",
  ].join("\n");
}

export const getTwilioWhatsAppConfig = getWhatsAppBusinessConfig;

export function buildWhatsAppDeepLink(phone: string, text: string) {
  const digits = normalizeWhatsAppDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function buildClientTripMessage(input: {
  firstName: string;
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  appLink?: string | null;
  email?: string | null;
  password?: string | null;
  quoteUrl?: string | null;
  /** Liens courts préférés (travelba.fr/d/… et /v/…). */
  expenseUrl?: string | null;
  tripUrl?: string | null;
}) {
  const prenom = (input.firstName || "").trim() || "voyageur";
  const expense = input.expenseUrl || input.quoteUrl;
  const trip = input.tripUrl || input.appLink;

  const lines = [`Bonjour ${prenom},`, "", "Voici ton dossier voyage :", ""];

  if (expense) {
    lines.push(`Suivie des dépenses`);
    lines.push(expense);
    lines.push("");
  }
  if (trip) {
    lines.push(`Récapitulatif du voyage`);
    lines.push(trip);
    lines.push("");
  }

  lines.push("— Le Concierge");
  return lines.join("\n");
}

export type WhatsAppSendResult = {
  channel: "twilio" | "twilio_template";
  message_id?: string;
  deep_link?: string;
  from_display?: string;
  business_label?: string;
  delivery_status?: string;
  raw?: unknown;
};

export class WhatsAppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppConfigError";
  }
}

function assertTwilioConfigured() {
  const cfg = getWhatsAppBusinessConfig();
  if (!cfg.configured) {
    throw new WhatsAppConfigError(
      `WhatsApp Twilio non configuré. Ajoutez TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_WHATSAPP_FROM (ex. whatsapp:${siteConfig.whatsappDisplay.replace(/\s/g, "")}) dans .env.local / Vercel.`
    );
  }
  return cfg;
}

async function twilioCreateMessage(
  cfg: ReturnType<typeof getWhatsAppBusinessConfig>,
  params: Record<string, string>
) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const body = new URLSearchParams(params);
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString(
    "base64"
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    const apiMsg =
      (raw as { message?: string })?.message ||
      (raw as { error_message?: string })?.error_message ||
      `Twilio WhatsApp ${res.status}`;
    const sid = cfg.accountSid || "";
    console.error("[twilio] send failed", {
      status: res.status,
      sidLen: sid.length,
      sidPrefix: sid.slice(0, 2),
    });
    throw new Error(apiMsg);
  }

  const messageId = (raw as { sid?: string })?.sid;
  return { raw, messageId };
}

async function twilioFetchMessage(
  cfg: ReturnType<typeof getWhatsAppBusinessConfig>,
  messageSid: string
) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages/${messageSid}.json`;
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString(
    "base64"
  );
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return (await res.json().catch(() => null)) as {
    status?: string;
    error_code?: number | null;
    error_message?: string | null;
  } | null;
}

/** Attend un statut final court — détecte undelivered (ex. 63016). */
async function awaitDeliveryOrThrow(
  cfg: ReturnType<typeof getWhatsAppBusinessConfig>,
  messageSid: string
) {
  let last: Awaited<ReturnType<typeof twilioFetchMessage>> = null;
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 800 + i * 400));
    last = await twilioFetchMessage(cfg, messageSid);
    const st = last?.status;
    if (
      st === "delivered" ||
      st === "read" ||
      st === "failed" ||
      st === "undelivered"
    ) {
      break;
    }
  }
  if (last?.status === "undelivered" || last?.status === "failed") {
    const code = last.error_code;
    if (code === 63016) {
      throw new Error(
        "WhatsApp refusé (63016) : hors fenêtre 24h. Utilisez un template Content (TWILIO_WHATSAPP_CONTENT_SID)."
      );
    }
    throw new Error(
      last.error_message ||
        `WhatsApp non délivré (statut ${last.status}${code ? `, code ${code}` : ""}).`
    );
  }
  return last?.status;
}

function baseSendParams(
  cfg: ReturnType<typeof getWhatsAppBusinessConfig>,
  to: string
): Record<string, string> {
  const params: Record<string, string> = { To: to };
  if (cfg.messagingServiceSid) {
    params.MessagingServiceSid = cfg.messagingServiceSid;
  }
  if (cfg.from) {
    params.From = cfg.from;
  }
  return params;
}

/**
 * Envoi voyage : privilégie le template Content (obligatoire hors 24h),
 * sinon texte libre si TWILIO_WHATSAPP_FORCE_BODY=1.
 */
export async function sendWhatsAppText(opts: {
  toPhone: string;
  body: string;
  firstName?: string;
  destination?: string;
  appLink?: string | null;
  quoteUrl?: string | null;
}): Promise<WhatsAppSendResult> {
  const cfg = assertTwilioConfigured();
  const forceBody = process.env.TWILIO_WHATSAPP_FORCE_BODY === "1";

  if (cfg.contentSid && !forceBody) {
    return sendWhatsAppTripTemplate({
      toPhone: opts.toPhone,
      body: opts.body,
      firstName: opts.firstName,
      destination: opts.destination,
      appLink: opts.appLink,
      quoteUrl: opts.quoteUrl,
    });
  }

  const to = toWhatsAppAddress(opts.toPhone);
  const deepLink =
    buildWhatsAppDeepLink(opts.toPhone, opts.body) || undefined;

  try {
    const { raw, messageId } = await twilioCreateMessage(cfg, {
      ...baseSendParams(cfg, to),
      Body: opts.body,
    });
    let delivery_status: string | undefined;
    if (messageId) {
      delivery_status = await awaitDeliveryOrThrow(cfg, messageId);
    }
    return {
      channel: "twilio",
      message_id: messageId,
      deep_link: deepLink,
      from_display: cfg.displayNumber,
      business_label: cfg.label,
      delivery_status,
      raw,
    };
  } catch (err) {
    // Fallback auto template si 63016 et contentSid dispo
    const msg = err instanceof Error ? err.message : String(err);
    if (cfg.contentSid && /63016|fenêtre 24h|Outside the allowed window/i.test(msg)) {
      return sendWhatsAppTripTemplate({
        toPhone: opts.toPhone,
        body: opts.body,
        firstName: opts.firstName,
        destination: opts.destination,
        appLink: opts.appLink,
        quoteUrl: opts.quoteUrl,
        deepLink,
      });
    }
    throw err;
  }
}

/**
 * Template Content API.
 * - dossier liens (si TWILIO_WHATSAPP_DOSSIER_CONTENT_SID) : {{1}} prénom, {{2}} dépenses, {{3}} My Trip
 * - concierge_note_fr (défaut) : {{1}} = corps du message
 * - sinon : 1=prénom, 2=destination, 3=lien, 4=extrait
 */
export async function sendWhatsAppTripTemplate(opts: {
  toPhone: string;
  body: string;
  firstName?: string;
  destination?: string;
  appLink?: string | null;
  quoteUrl?: string | null;
  deepLink?: string;
}): Promise<WhatsAppSendResult> {
  const cfg = assertTwilioConfigured();
  const dossierSid =
    cfg.dossierContentSid ||
    (process.env.TWILIO_WHATSAPP_USE_DOSSIER_TEMPLATE === "1"
      ? DEFAULT_TWILIO_DOSSIER_CONTENT_SID
      : "");
  const useDossier =
    Boolean(dossierSid) &&
    Boolean(opts.quoteUrl) &&
    Boolean(opts.appLink) &&
    process.env.TWILIO_WHATSAPP_CONTENT_MODE !== "note";

  const contentSid = useDossier ? dossierSid : cfg.contentSid;
  if (!contentSid) {
    throw new WhatsAppConfigError(
      "TWILIO_WHATSAPP_CONTENT_SID manquant (template Content API HX…)."
    );
  }

  const to = toWhatsAppAddress(opts.toPhone);
  const isNoteTemplate =
    contentSid === DEFAULT_TWILIO_CONTENT_SID ||
    process.env.TWILIO_WHATSAPP_CONTENT_MODE === "note";
  const isDossierTemplate =
    contentSid === dossierSid ||
    contentSid === DEFAULT_TWILIO_DOSSIER_CONTENT_SID;

  const variables = isDossierTemplate
    ? {
        "1": opts.firstName || "voyageur",
        "2": opts.quoteUrl!,
        "3": opts.appLink!,
      }
    : isNoteTemplate
      ? { "1": opts.body.slice(0, 1000) }
      : {
          "1": opts.firstName || "client",
          "2": opts.destination || "voyage",
          "3":
            opts.quoteUrl ||
            opts.appLink ||
            "voir message Travel Business Agency",
          "4": opts.body.slice(0, 500),
        };

  try {
    const { raw, messageId } = await twilioCreateMessage(cfg, {
      ...baseSendParams(cfg, to),
      ContentSid: contentSid,
      ContentVariables: JSON.stringify(variables),
    });

    let delivery_status: string | undefined;
    if (messageId) {
      delivery_status = await awaitDeliveryOrThrow(cfg, messageId);
    }

    return {
      channel: "twilio_template",
      message_id: messageId,
      deep_link: opts.deepLink,
      from_display: cfg.displayNumber,
      business_label: cfg.label,
      delivery_status,
      raw,
    };
  } catch (err) {
    // Dossier template pas encore approuvé → repli note avec corps complet
    if (useDossier && contentSid !== DEFAULT_TWILIO_CONTENT_SID) {
      const { raw, messageId } = await twilioCreateMessage(cfg, {
        ...baseSendParams(cfg, to),
        ContentSid: DEFAULT_TWILIO_CONTENT_SID,
        ContentVariables: JSON.stringify({ "1": opts.body.slice(0, 1000) }),
      });
      let delivery_status: string | undefined;
      if (messageId) {
        delivery_status = await awaitDeliveryOrThrow(cfg, messageId);
      }
      return {
        channel: "twilio_template",
        message_id: messageId,
        deep_link: opts.deepLink,
        from_display: cfg.displayNumber,
        business_label: cfg.label,
        delivery_status,
        raw,
      };
    }
    throw err;
  }
}

/**
 * Réponse libre dans la fenêtre 24h (staff inbound / client qui écrit).
 * Ne pas utiliser hors fenêtre — préférer un template Content.
 */
export async function sendWhatsAppReply(opts: {
  toPhone: string;
  body: string;
}): Promise<WhatsAppSendResult> {
  const cfg = assertTwilioConfigured();
  const to = toWhatsAppAddress(opts.toPhone);
  const { raw, messageId } = await twilioCreateMessage(cfg, {
    ...baseSendParams(cfg, to),
    Body: opts.body.slice(0, 1600),
  });
  return {
    channel: "twilio",
    message_id: messageId,
    from_display: cfg.displayNumber,
    business_label: cfg.label,
    raw,
  };
}

/**
 * Message 1 — Opt-in Concierge (template quick-reply Oui / Non merci).
 * Si le template n’est pas encore approuvé par Meta, repli sur concierge_note_fr
 * avec le même texte (sans boutons).
 */
export async function sendWhatsAppOptIn(opts: {
  toPhone: string;
  firstName: string;
}): Promise<WhatsAppSendResult & { body: string; used_buttons: boolean }> {
  const cfg = assertTwilioConfigured();
  const body = buildConciergeOptInMessage(opts.firstName);
  const to = toWhatsAppAddress(opts.toPhone);
  const deepLink = buildWhatsAppDeepLink(opts.toPhone, body) || undefined;

  if (cfg.optinContentSid) {
    try {
      const { raw, messageId } = await twilioCreateMessage(cfg, {
        ...baseSendParams(cfg, to),
        ContentSid: cfg.optinContentSid,
        ContentVariables: JSON.stringify({
          "1": opts.firstName?.trim() || "voyageur",
        }),
      });
      let delivery_status: string | undefined;
      if (messageId) {
        delivery_status = await awaitDeliveryOrThrow(cfg, messageId);
      }
      return {
        channel: "twilio_template",
        message_id: messageId,
        deep_link: deepLink,
        from_display: cfg.displayNumber,
        business_label: cfg.label,
        delivery_status,
        raw,
        body,
        used_buttons: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Template pas encore approuvé / catégorie / variables → repli note
      if (
        !/not.?approved|pending|rejected|63016|Content|template|category|invalid/i.test(
          msg
        )
      ) {
        throw err;
      }
      // continue fallback below
    }
  }

  const fallback = await sendWhatsAppTripTemplate({
    toPhone: opts.toPhone,
    body,
    firstName: opts.firstName,
    deepLink,
  });
  return { ...fallback, body, used_buttons: false };
}
