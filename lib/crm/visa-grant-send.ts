import "server-only";
import { productionOnlySecret } from "./preview-secrets";
import { whatsappContentApproved } from "./twilio-content-sid";
import { visaGrantSignedPath } from "./visa-grant-link";
import { sendContentTemplate } from "./whatsapp";
import { isContentSid, serviceContentSidStore, type ContentSidStore } from "./whatsapp-content-sid-store";
import {
  VISA_GRANT_TEMPLATE_ENV,
  VISA_GRANT_UNSUPPORTED,
  visaGrantAuthorizationName,
  visaGrantContentVariables,
  visaGrantFileName,
  visaGrantGivenName,
  visaGrantHeader,
  visaGrantLabel,
  visaGrantLegacyPreview,
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

function envContentSid(envName: string) {
  const value = productionOnlySecret(process.env[envName]);
  return isContentSid(value) ? value : "";
}

async function storedSid(store: ContentSidStore, envName: string) {
  try {
    return (await store.read(envName)) || "";
  } catch {
    return "";
  }
}

/**
 * La v2 part dès que Meta l’a approuvée. Sinon le SID v1, réglage puis variable.
 * La variante n’est pas choisie par le repli générique `_V2` : le texte et les variables doivent suivre.
 */
export async function chooseVisaGrantTemplate(
  header: VisaGrantHeader,
  fetchImpl: typeof fetch = fetch,
  store: ContentSidStore = serviceContentSidStore()
): Promise<{ sid: string; template: VisaGrantTemplate } | null> {
  const next = visaGrantTemplateForHeader(header, "v2");
  const nextSid = (await storedSid(store, VISA_GRANT_TEMPLATE_ENV[next])) || envContentSid(VISA_GRANT_TEMPLATE_ENV[next]);
  if (nextSid && (await whatsappContentApproved(nextSid, fetchImpl))) {
    return { sid: nextSid, template: next };
  }
  const current = visaGrantTemplateForHeader(header, "v1");
  const currentSid =
    (await storedSid(store, VISA_GRANT_TEMPLATE_ENV[current])) || envContentSid(VISA_GRANT_TEMPLATE_ENV[current]);
  if (!currentSid) return null;
  return { sid: currentSid, template: current };
}

/** Réglage crm_whatsapp_content_sids, puis la variable. v2 approuvée, sinon v1. */
export async function resolveVisaGrantContentSid(
  header: VisaGrantHeader,
  fetchImpl: typeof fetch = fetch,
  store: ContentSidStore = serviceContentSidStore()
) {
  return (await chooseVisaGrantTemplate(header, fetchImpl, store))?.sid || "";
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
  const chosen = await chooseVisaGrantTemplate(header, deps?.fetchImpl, deps?.store);
  if (!chosen) return { ok: false, error: visaGrantPendingMessage(header) };
  const { sid, template } = chosen;
  const label = visaGrantLabel({ country: input.country, docType: input.docType });
  const authorization = visaGrantAuthorizationName({ country: input.country, docType: input.docType });
  const filename = visaGrantFileName({
    label,
    firstName: input.firstName || input.greetingName,
    lastName: input.lastName || "Voyageur",
    header,
    mime: input.mime,
  });
  const named = visaGrantPreview(input.greetingName, authorization);
  const body = template.endsWith("_v2") ? named : visaGrantLegacyPreview(input.greetingName);
  if (!filename || !named || !body) return { ok: false, error: "Le nom du fichier n’a pas pu être préparé." };
  const mediaPath = visaGrantSignedPath(input.documentId, filename);
  const variables = mediaPath
    ? visaGrantContentVariables(
        mediaPath,
        visaGrantGivenName(input.greetingName),
        template.endsWith("_v2") ? authorization : undefined
      )
    : null;
  if (!variables) return { ok: false, error: "L’adresse du document n’a pas pu être signée." };
  const result = await sendContentTemplate({ phone: input.phone, contentSid: sid, variables, fetchImpl: deps?.fetchImpl });
  if (result.ok) return { ok: true, sid: result.sid, template, body: named };
  if (result.reason === "not_configured") return { ok: false, error: "WhatsApp n’est pas configuré." };
  if (result.reason === "no_phone") return { ok: false, error: "Pas de téléphone pour WhatsApp." };
  return { ok: false, error: "WhatsApp a refusé le message." };
}
