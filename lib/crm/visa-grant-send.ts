import "server-only";
import { visaGrantSignedPath } from "./visa-grant-link";
import { resolveContentSid } from "./twilio-content-sid";
import { sendContentTemplate } from "./whatsapp";
import {
  VISA_GRANT_TEMPLATE_ENV,
  VISA_GRANT_UNSUPPORTED,
  visaGrantContentVariables,
  visaGrantFileName,
  visaGrantGivenName,
  visaGrantHeader,
  visaGrantLabel,
  visaGrantPendingMessage,
  visaGrantPreview,
  visaGrantTemplateForHeader,
  type VisaGrantTemplate,
} from "./visa-grant-whatsapp";

export async function sendVisaGrantWhatsapp(input: {
  phone: string | null;
  documentId: string;
  mime: string | null;
  storedName: string | null;
  firstName: string | null;
  lastName: string | null;
  greetingName: string | null;
  country: string | null;
  docType: string | null;
}): Promise<{ ok: true; sid: string; template: VisaGrantTemplate; body: string } | { ok: false; error: string }> {
  const header = visaGrantHeader(input.mime, input.storedName);
  if (!header) return { ok: false, error: VISA_GRANT_UNSUPPORTED };
  const template = visaGrantTemplateForHeader(header);
  const sid = await resolveContentSid(VISA_GRANT_TEMPLATE_ENV[template]);
  if (!sid) return { ok: false, error: visaGrantPendingMessage(header) };
  const label = visaGrantLabel({ country: input.country, docType: input.docType });
  const filename = visaGrantFileName({
    label,
    firstName: input.firstName || input.greetingName,
    lastName: input.lastName || "Voyageur",
    header,
    mime: input.mime,
  });
  const body = visaGrantPreview(input.greetingName);
  if (!filename || !body) return { ok: false, error: "Le nom du fichier n’a pas pu être préparé." };
  const mediaPath = visaGrantSignedPath(input.documentId, filename);
  const variables = mediaPath ? visaGrantContentVariables(mediaPath, visaGrantGivenName(input.greetingName)) : null;
  if (!variables) return { ok: false, error: "L’adresse du document n’a pas pu être signée." };
  const result = await sendContentTemplate({ phone: input.phone, contentSid: sid, variables });
  if (result.ok) return { ok: true, sid: result.sid, template, body };
  if (result.reason === "not_configured") return { ok: false, error: "WhatsApp n’est pas configuré." };
  if (result.reason === "no_phone") return { ok: false, error: "Pas de téléphone pour WhatsApp." };
  return { ok: false, error: "WhatsApp a refusé le message." };
}
