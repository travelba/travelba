import { greetingGivenName } from "./identity";
import { tripShareMessage } from "./trip-share";
import { isTripShareCode, isTripShareUrl } from "./trip-share-check";
import { EXAMPLE_TRIP_CODE } from "./trip-share-example";
import { whatsappFailureSentence } from "./whatsapp";

export const TRIP_SHARE_TEMPLATE_KEY = "partage_voyage";
export const TRIP_SHARE_SESSION_KEY = "partage_voyage_session";
export const TRIP_SHARE_TEMPLATE_ENV = "TWILIO_CONTENT_PARTAGE_VOYAGE";

const TEMPLATE_BODY = ["Bonjour {{1}},", "", "Voici le voyage {{2}}.", "", "Travel Business Agency"].join("\n");

export type TripShareAudience = "staff" | "client";
export type TripShareRefusal =
  | "no_phone"
  | "outside_window"
  | "preview"
  | "journal"
  | "rejected"
  | "not_configured"
  | "twilio";

export function tripShareParisDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function tripShareDedupeKey(bookingId: string, companionId: string, day: string) {
  return `partage:${bookingId}:${companionId}:${day}`;
}

/** Un échec du jour se rejoue. Un envoi déjà parti ne bloque pas le clic suivant. */
export function tripShareAttemptKey(
  bookingId: string,
  companionId: string,
  day: string,
  prior: { status: string } | null,
  now: Date
) {
  const base = tripShareDedupeKey(bookingId, companionId, day);
  if (!prior || prior.status === "failed" || prior.status === "queued") return { key: base, reuse: Boolean(prior) };
  return { key: `${base}:${now.getTime()}`, reuse: false };
}

export function tripShareCodeFromUrl(url: string) {
  if (!isTripShareUrl(url)) return null;
  try {
    const code = new URL(url).pathname.replace(/\/+$/, "").split("/").pop() || "";
    return isTripShareCode(code) ? code : null;
  } catch {
    return null;
  }
}

function cleanSlot(value: string | null | undefined, max: number) {
  return (value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

/** {{1}} prénom, {{2}} nom du voyage, {{3}} code du lien public. Pas d’URL dans le corps. */
export function tripShareContentVariables(firstName: string | null | undefined, title: string, url: string) {
  const code = tripShareCodeFromUrl(url);
  if (!code) return null;
  const name = cleanSlot(greetingGivenName(firstName) || firstName, 40);
  const place = cleanSlot(title, 80) || "votre voyage";
  if (/https?:|travelba\.fr|\/mon-compte|\/e\//i.test(`${name} ${place}`)) return null;
  return { "1": name || " ", "2": place, "3": code };
}

export function tripShareTemplatePreview(firstName: string | null | undefined, title: string) {
  const name = cleanSlot(greetingGivenName(firstName) || firstName, 40);
  const place = cleanSlot(title, 80) || "votre voyage";
  const text = TEMPLATE_BODY.replace("{{1}}", name || "").replace("{{2}}", place);
  if (/\{\{\d+\}\}/.test(text)) return null;
  return text.replace("Bonjour ,", "Bonjour,");
}

export function tripShareTemplateJournal(firstName: string | null | undefined, title: string, url: string) {
  const preview = tripShareTemplatePreview(firstName, title);
  if (!preview || !tripShareCodeFromUrl(url)) return null;
  return `${preview}\n${url}`;
}

export function tripShareContentDrafts() {
  return [
    {
      template: TRIP_SHARE_TEMPLATE_KEY,
      env: TRIP_SHARE_TEMPLATE_ENV,
      friendlyName: TRIP_SHARE_TEMPLATE_KEY,
      create: {
        friendly_name: TRIP_SHARE_TEMPLATE_KEY,
        language: "fr" as const,
        variables: { "1": "Camille", "2": "Marrakech", "3": EXAMPLE_TRIP_CODE },
        types: {
          "twilio/call-to-action": {
            body: TEMPLATE_BODY,
            actions: [
              {
                type: "URL" as const,
                title: "Voir le voyage",
                url: "https://travelba.fr/v/{{3}}",
              },
            ],
          },
        },
      },
    },
  ];
}

export function tripShareSafeDetail(detail: string | undefined) {
  return (detail || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\+?\d{8,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function tripShareWindowFailure(detail: string | undefined) {
  return /63016|\b470\b|outside the allowed window|24 hour/i.test(detail || "");
}

export function tripShareRefusalMessage(reason: TripShareRefusal, audience: TripShareAudience) {
  if (reason === "no_phone") return "Cet accompagnateur n’a pas de téléphone. Le lien reste à copier.";
  if (reason === "outside_window") {
    return audience === "staff"
      ? "Hors des 24 heures. Cette personne n’a pas écrit aujourd’hui, et le modèle WhatsApp du partage n’est pas encore approuvé. Le lien reste à copier."
      : "Hors des 24 heures, WhatsApp ne peut pas envoyer ce lien. Copiez-le.";
  }
  if (reason === "preview") return "Envoi coupé sur l’aperçu. Le lien reste à copier.";
  if (reason === "journal") return "L’envoi n’a pas pu être enregistré. Rien n’a été envoyé.";
  if (reason === "not_configured") return "WhatsApp n’est pas disponible. Le lien reste à copier.";
  if (reason === "rejected") return "Ce lien ne peut pas partir par WhatsApp. Le lien reste à copier.";
  return "WhatsApp n’a pas pu remettre le lien. Le lien reste à copier.";
}

export function tripShareSentMessage(firstName: string) {
  const name = cleanSlot(firstName, 80);
  return `Lien envoyé à ${name || "l’accompagnateur"} par WhatsApp.`;
}

export type TripShareSendOutcome = { ok: true; sid: string } | { ok: false; detail?: string };

export type TripShareJournalRow = {
  customer_id: string;
  booking_id: string;
  direction: "outbound";
  template_key: string;
  body: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  dedupe_key: string;
  phone: string | null;
  author_staff_id: string | null;
  twilio_sid: string | null;
};

type Prior = { id: string; status: string } | null;

export async function runTripShareDelivery(
  input: {
    customerId: string;
    bookingId: string;
    companionId: string;
    phone: string | null;
    to: string | null;
    firstName: string;
    title: string;
    url: string;
    mediaUrl: string | null;
    audience: TripShareAudience;
    windowOpen: boolean;
    templateSid: string | null;
    previewBlocked: boolean;
    now: Date;
    prior: Prior;
    staffId: string | null;
  },
  deps: {
    sendSession: (message: { to: string; body: string; mediaUrl: string | null }) => Promise<TripShareSendOutcome>;
    sendTemplate: (message: { phone: string; contentSid: string; variables: Record<string, string> }) => Promise<TripShareSendOutcome>;
    insert: (row: TripShareJournalRow) => Promise<{ id: string } | { error: "duplicate" | "failed" }>;
    update: (id: string, patch: Partial<TripShareJournalRow>) => Promise<boolean>;
    find: (dedupeKey: string) => Promise<Prior>;
    read: (id: string) => Promise<{ status: string; error: string | null } | null>;
  }
): Promise<{ ok: true; message: string } | { ok: false; status: number; message: string; code: string }> {
  const day = tripShareParisDay(input.now);
  const attempt = tripShareAttemptKey(input.bookingId, input.companionId, day, input.prior, input.now);
  const sessionBody = tripShareMessage({ firstName: input.firstName, title: input.title, url: input.url });
  const variables = input.templateSid ? tripShareContentVariables(input.firstName, input.title, input.url) : null;
  const templateBody = tripShareTemplateJournal(input.firstName, input.title, input.url);
  const refusal = refusalOf(input, sessionBody, Boolean(variables && templateBody));
  if (refusal) {
    const message = tripShareRefusalMessage(refusal, input.audience);
    const recorded = await remember(deps, input, attempt, input.prior, {
      template_key: TRIP_SHARE_TEMPLATE_KEY,
      body: message,
      status: "failed",
      error: message,
      twilio_sid: null,
    });
    if (!recorded.ok) {
      return { ok: false, status: 502, message: tripShareRefusalMessage("journal", input.audience), code: "journal" };
    }
    const status = refusal === "no_phone" ? 400 : refusal === "preview" || refusal === "rejected" ? 403 : 502;
    return { ok: false, status, message, code: refusal };
  }

  const queuedKey = input.windowOpen ? TRIP_SHARE_SESSION_KEY : TRIP_SHARE_TEMPLATE_KEY;
  const queuedBody = input.windowOpen ? sessionBody : templateBody || sessionBody;
  const queued = await remember(deps, input, attempt, input.prior, {
    template_key: queuedKey,
    body: queuedBody,
    status: "queued",
    error: null,
    twilio_sid: null,
  });
  if (!queued.ok) {
    return { ok: false, status: 502, message: tripShareRefusalMessage("journal", input.audience), code: "journal" };
  }

  let sent: TripShareSendOutcome = { ok: false, detail: "not_sent" };
  let templateKey = queuedKey;
  let body = queuedBody;
  if (input.windowOpen && input.to) {
    sent = await deps.sendSession({ to: input.to, body: sessionBody, mediaUrl: input.mediaUrl });
    templateKey = TRIP_SHARE_SESSION_KEY;
    body = sessionBody;
    if (!sent.ok && tripShareWindowFailure(sent.detail) && input.templateSid && variables) {
      sent = await deps.sendTemplate({ phone: input.phone || "", contentSid: input.templateSid, variables });
      templateKey = TRIP_SHARE_TEMPLATE_KEY;
      body = templateBody || sessionBody;
    }
  } else if (input.templateSid && variables && input.phone) {
    sent = await deps.sendTemplate({ phone: input.phone, contentSid: input.templateSid, variables });
    templateKey = TRIP_SHARE_TEMPLATE_KEY;
    body = templateBody || sessionBody;
  }

  if (!sent.ok) {
    const reason = sent.detail === "not_configured" ? "not_configured" : tripShareWindowFailure(sent.detail) ? "outside_window" : "twilio";
    const message = reason === "outside_window"
      ? whatsappFailureSentence("63016", sent.detail)
      : tripShareRefusalMessage(reason, input.audience);
    const detail = tripShareSafeDetail(sent.detail);
    const error = detail && reason === "twilio" && !message.includes(detail) ? `${message} ${detail}`.slice(0, 300) : message;
    await deps.update(queued.id, { status: "failed", error, body: message, template_key: templateKey, twilio_sid: null });
    const status = reason === "not_configured" ? 503 : 502;
    return { ok: false, status, message, code: reason };
  }

  await deps.update(queued.id, {
    status: "sent",
    error: null,
    body,
    template_key: templateKey,
    twilio_sid: sent.sid,
  });
  const fresh = await deps.read(queued.id);
  if (fresh?.status === "failed") {
    const message = fresh.error || tripShareRefusalMessage("twilio", input.audience);
    return { ok: false, status: 502, message, code: "twilio" };
  }
  return { ok: true, message: tripShareSentMessage(input.firstName) };
}

function refusalOf(
  input: {
    to: string | null;
    phone: string | null;
    url: string;
    previewBlocked: boolean;
    windowOpen: boolean;
    templateSid: string | null;
  },
  sessionBody: string,
  templateReady: boolean
): TripShareRefusal | null {
  if (!isTripShareUrl(input.url) || sessionBody.includes("/mon-compte") || sessionBody.includes("/e/")) return "rejected";
  if (!input.phone || !input.to) return "no_phone";
  if (input.previewBlocked) return "preview";
  if (!input.windowOpen && !(input.templateSid && templateReady)) return "outside_window";
  return null;
}

async function remember(
  deps: {
    insert: (row: TripShareJournalRow) => Promise<{ id: string } | { error: "duplicate" | "failed" }>;
    update: (id: string, patch: Partial<TripShareJournalRow>) => Promise<boolean>;
    find: (dedupeKey: string) => Promise<Prior>;
  },
  input: { customerId: string; bookingId: string; phone: string | null; staffId: string | null },
  attempt: { key: string; reuse: boolean },
  prior: Prior,
  patch: Pick<TripShareJournalRow, "template_key" | "body" | "status" | "error" | "twilio_sid">
) {
  const row: TripShareJournalRow = {
    customer_id: input.customerId,
    booking_id: input.bookingId,
    direction: "outbound",
    phone: input.phone,
    author_staff_id: input.staffId,
    dedupe_key: attempt.key,
    ...patch,
  };
  const target = attempt.reuse ? prior : null;
  if (target) {
    const updated = await deps.update(target.id, patch);
    if (updated) return { ok: true as const, id: target.id };
  }
  const inserted = await deps.insert(row);
  if ("id" in inserted) return { ok: true as const, id: inserted.id };
  if (inserted.error === "duplicate") {
    const winner = await deps.find(attempt.key);
    if (winner) {
      await deps.update(winner.id, patch);
      return { ok: true as const, id: winner.id };
    }
  }
  return { ok: false as const };
}
