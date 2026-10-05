import { siteConfig } from "@/lib/site";

/** Boîte qui reçoit une copie de chaque e-mail envoyé par le CRM. */
export const AGENCY_MAIL_COPY = siteConfig.contactEmail;

type AddressField = string | string[] | null | undefined;

function listed(value: AddressField) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => item.trim()).filter(Boolean);
}

function mailbox(value: string) {
  const wrapped = value.match(/<([^>]+)>/);
  return (wrapped?.[1] || value).trim().toLowerCase();
}

/**
 * Destinataires en copie, avec contact@travelba.fr.
 * `undefined` si l’adresse est déjà dans to, cc ou bcc.
 */
export function agencyCopyCc(to: AddressField, cc?: AddressField, bcc?: AddressField): string[] | undefined {
  const copy = AGENCY_MAIL_COPY;
  const seen = new Set([...listed(to), ...listed(cc), ...listed(bcc)].map(mailbox));
  if (seen.has(copy.toLowerCase())) {
    const current = listed(cc);
    return current.length ? current : undefined;
  }
  return [...listed(cc), copy];
}

/**
 * Copie d’un e-mail porteur de jeton (invitation, lien magique, réinitialisation,
 * accès agence) : jamais contact@travelba.fr. La boîte partagée ne doit détenir
 * aucun lien de connexion. L’agence reçoit à la place `accessNoticeCopy`, sans le lien.
 */
export function tokenMailCc(cc?: AddressField): string[] | undefined {
  const copy = AGENCY_MAIL_COPY.toLowerCase();
  const kept = listed(cc).filter((item) => mailbox(item) !== copy);
  return kept.length ? kept : undefined;
}

export type AccessNoticeKind = "client" | "collegue";

/** Notification agence après une invitation. Prénom seulement, pas le lien. */
export function accessNoticeCopy(input: { kind: AccessNoticeKind; firstName: string | null | undefined }) {
  const who = (input.firstName || "").trim() || (input.kind === "collegue" ? "un collègue" : "un client");
  const subject = `Invitation envoyée à ${who}`;
  const where = input.kind === "collegue" ? "l’espace agence" : "son espace voyageur";
  const body = `L’invitation à ${where} vient de partir. Le lien n’est pas recopié ici : il n’appartient qu’au destinataire.`;
  return { subject, body };
}

