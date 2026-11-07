import { isVercelPreview } from "./preview-secrets";
import { proactiveWhatsappAllowed } from "./whatsapp-concierge";
import { sendContentTemplate, whatsappAddress, whatsappFailureSentence } from "./whatsapp";
import { sendWhatsappSession } from "./whatsapp-session";
import { freeMessageSignedPath } from "./free-message-link";
import {
  freeMessageContentVariables,
  freeMessageFileName,
  freeMessageHeader,
  freeMessageIdentityBlocked,
  freeMessageMediaUrl,
  freeMessagePendingMessage,
  freeMessageSessionBody,
  freeMessageTemplateFor,
  freeMessageTemplatePreview,
  freeMessageTextError,
  type FreeMessageTemplate,
} from "./free-message-whatsapp";

export type FreeMessageAttachment = {
  id: string;
  mime: string | null;
  fileName: string | null;
  docType: string | null;
};

export type FreeMessagePlan = {
  canal: "session" | "modele";
  modele: FreeMessageTemplate | null;
  texte: string;
  piece: boolean;
};

type SendOutcome = { ok: true; sid: string } | { ok: false; detail?: string };

export function planFreeMessage(input: {
  windowOpen: boolean;
  text: string;
  firstName: string | null | undefined;
  file: FreeMessageAttachment | null;
}): { ok: true; plan: FreeMessagePlan } | { ok: false; error: string } {
  const textError = freeMessageTextError(input.text);
  if (textError) return { ok: false, error: textError };
  if (input.file && freeMessageIdentityBlocked(input.file.docType)) {
    return { ok: false, error: "Un passeport ou une carte d’identité ne part pas par ce message." };
  }
  const header = input.file ? freeMessageHeader(input.file.mime, input.file.fileName) : null;
  if (input.file && !header) return { ok: false, error: "Le fichier doit être un PDF, un JPEG ou un PNG." };

  if (input.windowOpen) {
    const session = freeMessageSessionBody(input.text);
    if (!session) return { ok: false, error: "Le message n’a pas pu être préparé." };
    return { ok: true, plan: { canal: "session", modele: null, texte: session, piece: Boolean(input.file) } };
  }

  const modele = freeMessageTemplateFor(header);
  const texte = freeMessageTemplatePreview(modele, input.firstName, input.text);
  if (!texte) return { ok: false, error: "Le message n’a pas pu être préparé." };
  return { ok: true, plan: { canal: "modele", modele, texte, piece: Boolean(input.file) } };
}

export function freeMessageChannelBlock(input: {
  phone?: string | null;
  optInAt?: string | null;
  optOutAt?: string | null;
  windowOpen: boolean;
  modele: FreeMessageTemplate | null;
  templateReady: boolean;
  previewBlocked?: boolean;
}) {
  if (input.previewBlocked) return "Envoi coupé sur l’aperçu.";
  if (!whatsappAddress(input.phone)) return "Pas de téléphone pour WhatsApp.";
  if (input.optOutAt) return "WhatsApp n’est pas accepté.";
  if (!input.windowOpen) {
    if (!proactiveWhatsappAllowed({ whatsapp_opt_in_at: input.optInAt, whatsapp_opt_out_at: input.optOutAt })) {
      return "WhatsApp n’est pas accepté.";
    }
    if (!input.modele || !input.templateReady) return freeMessagePendingMessage(input.modele || "message_libre_texte");
  }
  return null;
}

export async function deliverFreeMessage(
  input: {
    phone: string;
    windowOpen: boolean;
    text: string;
    firstName: string | null | undefined;
    file: FreeMessageAttachment | null;
    contentSid: string | null;
    now?: number;
  },
  deps?: {
    sendSession?: (message: { to: string; body: string; mediaUrl?: string | null }) => Promise<SendOutcome>;
    sendTemplate?: (message: { phone: string; contentSid: string; variables: Record<string, string> }) => Promise<SendOutcome>;
  }
): Promise<{ ok: true; sid: string; modele: FreeMessageTemplate | null } | { ok: false; error: string }> {
  const plan = planFreeMessage(input);
  if (!plan.ok) return plan;
  const to = whatsappAddress(input.phone);
  if (!to) return { ok: false, error: "Pas de téléphone pour WhatsApp." };

  if (plan.plan.canal === "session") {
    let mediaUrl: string | null = null;
    if (input.file) {
      const header = freeMessageHeader(input.file.mime, input.file.fileName);
      if (!header) return { ok: false, error: "Le fichier doit être un PDF, un JPEG ou un PNG." };
      const filename = freeMessageFileName(input.file.fileName, header, input.file.mime);
      const path = freeMessageSignedPath(input.file.id, filename, input.now);
      mediaUrl = path ? freeMessageMediaUrl(path) : null;
      if (!mediaUrl) return { ok: false, error: "L’adresse du document n’a pas pu être préparée. Rien n’a été envoyé." };
    }
    const send = deps?.sendSession ?? ((message) => sendWhatsappSession({ to: message.to, body: message.body, mediaUrl: message.mediaUrl }));
    const sent = await send({ to, body: plan.plan.texte, mediaUrl });
    if (!sent.ok) return { ok: false, error: whatsappFailureSentence(null, sent.detail) };
    return { ok: true, sid: sent.sid, modele: null };
  }

  const modele = plan.plan.modele;
  if (!modele || !input.contentSid) return { ok: false, error: freeMessagePendingMessage(modele || "message_libre_texte") };
  let mediaPath: string | null = null;
  if (input.file) {
    const header = freeMessageHeader(input.file.mime, input.file.fileName);
    if (!header) return { ok: false, error: "Le fichier doit être un PDF, un JPEG ou un PNG." };
    const filename = freeMessageFileName(input.file.fileName, header, input.file.mime);
    mediaPath = freeMessageSignedPath(input.file.id, filename, input.now);
    if (!mediaPath) return { ok: false, error: "L’adresse du document n’a pas pu être préparée. Rien n’a été envoyé." };
  }
  const variables = freeMessageContentVariables(modele, { mediaPath, firstName: input.firstName, text: input.text });
  if (!variables) return { ok: false, error: "Le message n’a pas pu être préparé." };
  const send =
    deps?.sendTemplate ??
    ((message) => sendContentTemplate({ phone: message.phone, contentSid: message.contentSid, variables: message.variables }));
  const sent = await send({ phone: input.phone, contentSid: input.contentSid, variables });
  if (!sent.ok) return { ok: false, error: "WhatsApp n’a pas accepté le message." };
  return { ok: true, sid: sent.sid, modele };
}

export function freeMessagePreviewBlocked() {
  return isVercelPreview();
}
