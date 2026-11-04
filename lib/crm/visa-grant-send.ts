import "server-only";
import { resolveAgencyContentSid } from "./agency-templates-arm";
import { visaGrantSignedPath } from "./visa-grant-link";
import { sendContentTemplate } from "./whatsapp";
import { serviceContentSidStore, type ContentSidStore } from "./whatsapp-content-sid-store";
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
  type VisaGrantHeader,
  type VisaGrantTemplate,
} from "./visa-grant-whatsapp";

export type AuthorizationGrantSids = { document: string; image: string };

/** Les deux SID, réglage puis variable. Une lecture en échec vaut « pas de SID ». */
export async function loadAuthorizationGrantSids(
  fetchImpl: typeof fetch = fetch,
  store: ContentSidStore = serviceContentSidStore()
): Promise<AuthorizationGrantSids> {
  const [document, image] = await Promise.all([
    resolveVisaGrantContentSid("document", fetchImpl, store).catch(() => ""),
    resolveVisaGrantContentSid("image", fetchImpl, store).catch(() => ""),
  ]);
  return { document, image };
}

/** Réglage crm_whatsapp_content_sids, puis la variable TWILIO_CONTENT_AUTORISATION_VALIDEE_*. */
export async function resolveVisaGrantContentSid(
  header: VisaGrantHeader,
  fetchImpl: typeof fetch = fetch,
  store: ContentSidStore = serviceContentSidStore()
) {
  return resolveAgencyContentSid(VISA_GRANT_TEMPLATE_ENV[visaGrantTemplateForHeader(header)], fetchImpl, store);
}

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
}, deps?: { fetchImpl?: typeof fetch; store?: ContentSidStore }): Promise<{ ok: true; sid: string; template: VisaGrantTemplate; body: string } | { ok: false; error: string }> {
  const header = visaGrantHeader(input.mime, input.storedName);
  if (!header) return { ok: false, error: VISA_GRANT_UNSUPPORTED };
  const template = visaGrantTemplateForHeader(header);
  const sid = await resolveVisaGrantContentSid(header, deps?.fetchImpl, deps?.store);
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
