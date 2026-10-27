import { greetingGivenName } from "./identity";
import { siteConfig } from "../site";
import { CONCIERGE_SIGNATURE } from "./whatsapp";
import { STATEMENT_FILENAME, statementWhatsappBody, type StatementAudience } from "./statement";

export const STATEMENT_TEMPLATE_KEY = "releve";
export const STATEMENT_SESSION_KEY = "releve_session";
export const STATEMENT_TEMPLATE_ENV = "TWILIO_CONTENT_RELEVE";
export const STATEMENT_URL_TTL_SECONDS = 60 * 60;
export const STATEMENT_SAMPLE_FILE = "releve-exemple.pdf";
export const STATEMENT_SAMPLE_PATH = `exemple/${STATEMENT_SAMPLE_FILE}`;
export const STATEMENT_SAMPLE_NAME = "Releve-de-compte-EXEMPLE.pdf";

const TEMPLATE_BODY = [
  "Bonjour {{2}},",
  "",
  "Voici votre {{3}}, joint à ce message.",
  "",
  CONCIERGE_SIGNATURE,
].join("\n");

export type StatementChannel = "template" | "session" | "none";

export type StatementRefusal = "no_phone" | "opt_out" | "outside_window" | "preview" | "journal" | "upload" | "media" | "twilio";

export function statementParisDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function statementDedupeKey(customerId: string, day: string) {
  return `releve:${customerId}:${day}`;
}

/** Un échec du jour se rejoue. Un envoi déjà parti ne bloque pas le clic suivant. */
export function statementAttemptKey(
  customerId: string,
  day: string,
  prior: { status: string } | null,
  now: Date
) {
  const base = statementDedupeKey(customerId, day);
  if (!prior || prior.status === "failed" || prior.status === "queued") return { key: base, reuse: Boolean(prior) };
  return { key: `${base}:${now.getTime()}`, reuse: false };
}

export function statementDocumentLabel(member: boolean) {
  return member ? "relevé de frais" : "relevé de compte";
}

export function statementTemplateName(firstName: string | null | undefined) {
  const name = (greetingGivenName(firstName) || "").replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  return name || " ";
}

export function statementMediaVariable(token: string) {
  if (!token || token.includes("/") || token.includes("..")) return null;
  return `${token}/${encodeURIComponent(STATEMENT_FILENAME)}`;
}

export function statementMediaUrl(mediaPath: string) {
  if (!mediaPath || mediaPath.includes("..") || /^https?:/i.test(mediaPath)) return null;
  return `${siteConfig.url}/api/whatsapp/releves/${mediaPath}`;
}

export function statementTemplatePreview(firstName: string | null | undefined, member: boolean) {
  const text = TEMPLATE_BODY.replace("{{2}}", statementTemplateName(firstName).trim() || "").replace(
    "{{3}}",
    statementDocumentLabel(member)
  );
  if (/\{\{\d+\}\}/.test(text)) return null;
  return text.replace("Bonjour ,", "Bonjour,");
}

export function statementContentVariables(mediaPath: string, firstName: string | null | undefined, member: boolean) {
  if (!mediaPath.endsWith(".pdf") || mediaPath.includes("..") || /^https?:/i.test(mediaPath)) return null;
  return {
    "1": mediaPath,
    "2": statementTemplateName(firstName),
    "3": statementDocumentLabel(member),
  };
}

export function statementContentDrafts() {
  return [
    {
      template: STATEMENT_TEMPLATE_KEY,
      env: STATEMENT_TEMPLATE_ENV,
      friendlyName: STATEMENT_TEMPLATE_KEY,
      create: {
        friendly_name: STATEMENT_TEMPLATE_KEY,
        language: "fr" as const,
        variables: {
          "1": STATEMENT_SAMPLE_PATH,
          "2": "Camille",
          "3": "relevé de compte",
        },
        types: {
          "twilio/media": {
            body: TEMPLATE_BODY,
            media: [`${siteConfig.url}/api/whatsapp/releves/{{1}}`],
          },
        },
      },
    },
  ];
}

export function statementSafeDetail(detail: string | undefined) {
  return (detail || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\+?\d{8,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function statementRefusalMessage(reason: StatementRefusal, audience: StatementAudience) {
  if (reason === "no_phone") {
    return audience === "staff"
      ? "Ce client n’a pas de téléphone pour WhatsApp. Le relevé reste à télécharger."
      : "Ajoutez un téléphone dans Vous pour recevoir le relevé sur WhatsApp.";
  }
  if (reason === "opt_out") {
    return audience === "staff"
      ? "Ce client a coupé WhatsApp. Le relevé reste à télécharger."
      : "WhatsApp est coupé sur votre fiche. Téléchargez le relevé.";
  }
  if (reason === "outside_window") {
    return audience === "staff"
      ? "Hors des 24 heures. Le client n’a pas écrit aujourd’hui, et le modèle WhatsApp du relevé n’est pas encore approuvé. Le relevé reste à télécharger."
      : "Hors des 24 heures, WhatsApp ne peut pas joindre le relevé. Téléchargez-le.";
  }
  if (reason === "preview") return "Envoi coupé sur l’aperçu. Le relevé reste à télécharger.";
  if (reason === "journal") return "Le relevé n’a pas pu être enregistré. Rien n’a été envoyé.";
  if (reason === "upload") return "Le fichier du relevé n’a pas pu être préparé.";
  if (reason === "media") return "L’adresse du PDF n’a pas pu être préparée. Rien n’a été envoyé.";
  return "WhatsApp n’a pas pu remettre le relevé. Téléchargez-le.";
}

export type StatementSendOutcome = { ok: true; sid: string } | { ok: false; detail?: string };

export type StatementJournalRow = {
  customer_id: string;
  direction: "outbound";
  template_key: string;
  body: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  dedupe_key: string;
  phone: string | null;
  author_staff_id: string | null;
  media_path: string | null;
  twilio_sid: string | null;
  /** Jeton du bot (`mcp`, ou le nom du jeton). Vide pour un collaborateur. */
  payload: { actor: string } | null;
};

type Prior = { id: string; status: string } | null;

export async function runStatementDelivery(
  input: {
    customerId: string;
    phone: string | null;
    to: string | null;
    firstName: string | null | undefined;
    member: boolean;
    audience: StatementAudience;
    pdf: Uint8Array;
    windowOpen: boolean;
    templateSid: string | null;
    optedOut: boolean;
    previewBlocked: boolean;
    now: Date;
    prior: Prior;
    staffId: string | null;
    /** Identifiant du bot. Reste vide quand l’auteur est un collaborateur. */
    botId: string | null;
  },
  deps: {
    upload: (path: string, pdf: Uint8Array) => Promise<void>;
    objectPath: (customerId: string) => string | null;
    mediaPath: (customerId: string, now: Date) => string | null;
    sendSession: (input: { to: string; body: string; mediaUrl: string }) => Promise<StatementSendOutcome>;
    sendTemplate: (input: { phone: string; contentSid: string; variables: Record<string, string> }) => Promise<StatementSendOutcome>;
    insert: (row: StatementJournalRow) => Promise<{ id: string } | { error: "duplicate" | "failed" }>;
    update: (id: string, patch: Partial<StatementJournalRow>) => Promise<boolean>;
    find: (dedupeKey: string) => Promise<Prior>;
  }
): Promise<StatementDeliveryResult> {
  const day = statementParisDay(input.now);
  const attempt = statementAttemptKey(input.customerId, day, input.prior, input.now);
  const refusal = refusalOf(input);
  if (refusal) {
    const message = statementRefusalMessage(refusal, input.audience);
    const recorded = await remember(deps, input, attempt, input.prior, {
      template_key: STATEMENT_TEMPLATE_KEY,
      body: message,
      status: "failed",
      error: message,
      media_path: null,
      twilio_sid: null,
    });
    if (!recorded.ok) {
      return deliveryFailure(502, statementRefusalMessage("journal", input.audience), "journal");
    }
    const status = refusal === "no_phone" || refusal === "opt_out" ? 400 : refusal === "preview" ? 403 : 502;
    return deliveryFailure(status, message, refusal);
  }

  const storagePath = deps.objectPath(input.customerId);
  const mediaPath = deps.mediaPath(input.customerId, input.now);
  const mediaUrl = mediaPath ? statementMediaUrl(mediaPath) : null;
  if (!storagePath || !mediaPath || !mediaUrl || !input.to || !input.phone) {
    const message = statementRefusalMessage(!input.to || !input.phone ? "no_phone" : "media", input.audience);
    await remember(deps, input, attempt, input.prior, {
      template_key: STATEMENT_TEMPLATE_KEY,
      body: message,
      status: "failed",
      error: message,
      media_path: storagePath,
      twilio_sid: null,
    });
    return deliveryFailure(502, message, "media");
  }

  try {
    await deps.upload(storagePath, input.pdf);
  } catch {
    const message = statementRefusalMessage("upload", input.audience);
    await remember(deps, input, attempt, input.prior, {
      template_key: STATEMENT_TEMPLATE_KEY,
      body: message,
      status: "failed",
      error: message,
      media_path: null,
      twilio_sid: null,
    });
    return deliveryFailure(502, message, "upload");
  }

  const templatePreview = statementTemplatePreview(input.firstName, input.member);
  const sessionBody = statementWhatsappBody(input.firstName, input.member);
  const queuedBody = input.templateSid && templatePreview ? templatePreview : sessionBody;
  const queuedKey = input.templateSid ? STATEMENT_TEMPLATE_KEY : STATEMENT_SESSION_KEY;
  const queued = await remember(deps, input, attempt, input.prior, {
    template_key: queuedKey,
    body: queuedBody,
    status: "queued",
    error: null,
    media_path: storagePath,
    twilio_sid: null,
  });
  if (!queued.ok) {
    return deliveryFailure(502, statementRefusalMessage("journal", input.audience), "journal");
  }

  let sent: StatementSendOutcome = { ok: false, detail: "not_sent" };
  let templateKey = queuedKey;
  let body = queuedBody;
  if (input.templateSid && templatePreview) {
    const variables = statementContentVariables(mediaPath, input.firstName, input.member);
    if (variables) {
      sent = await deps.sendTemplate({ phone: input.phone, contentSid: input.templateSid, variables });
      templateKey = STATEMENT_TEMPLATE_KEY;
      body = templatePreview;
    }
  }
  if (!sent.ok && input.windowOpen) {
    sent = await deps.sendSession({ to: input.to, body: sessionBody, mediaUrl });
    templateKey = STATEMENT_SESSION_KEY;
    body = sessionBody;
  }

  if (!sent.ok) {
    const detail = statementSafeDetail(sent.detail);
    const message = statementRefusalMessage("twilio", input.audience);
    const error = detail ? `${message} ${detail}`.slice(0, 300) : message;
    await deps.update(queued.id, { status: "failed", error, body: message, template_key: templateKey, twilio_sid: null });
    return deliveryFailure(502, message, "twilio");
  }

  await deps.update(queued.id, {
    status: "sent",
    error: null,
    body,
    template_key: templateKey,
    twilio_sid: sent.sid,
    media_path: storagePath,
  });
  return {
    ok: true,
    message: input.audience === "staff" ? "Relevé envoyé sur le WhatsApp du client." : "Relevé envoyé sur votre WhatsApp.",
    sid: sent.sid,
    statut: "sent",
  };
}

export type StatementDeliveryResult =
  | { ok: true; message: string; sid: string; statut: "sent" }
  | { ok: false; status: number; message: string; code: string; sid: null; statut: "failed" };

function deliveryFailure(status: number, message: string, code: string): StatementDeliveryResult {
  return { ok: false, status, message, code, sid: null, statut: "failed" };
}

function refusalOf(input: {
  to: string | null;
  phone: string | null;
  optedOut: boolean;
  previewBlocked: boolean;
  windowOpen: boolean;
  templateSid: string | null;
}): StatementRefusal | null {
  if (!input.phone || !input.to) return "no_phone";
  if (input.optedOut) return "opt_out";
  if (input.previewBlocked) return "preview";
  if (!input.templateSid && !input.windowOpen) return "outside_window";
  return null;
}

async function remember(
  deps: {
    insert: (row: StatementJournalRow) => Promise<{ id: string } | { error: "duplicate" | "failed" }>;
    update: (id: string, patch: Partial<StatementJournalRow>) => Promise<boolean>;
    find: (dedupeKey: string) => Promise<Prior>;
  },
  input: { customerId: string; phone: string | null; staffId: string | null; botId: string | null },
  attempt: { key: string; reuse: boolean },
  prior: Prior,
  patch: Pick<StatementJournalRow, "template_key" | "body" | "status" | "error" | "media_path" | "twilio_sid">
) {
  const row: StatementJournalRow = {
    customer_id: input.customerId,
    direction: "outbound",
    phone: input.phone,
    author_staff_id: input.staffId,
    payload: input.botId ? { actor: input.botId } : null,
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
