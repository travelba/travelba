/** Images de signature et mails sans réservation : pas d’appel au modèle. */

export const SIGNATURE_IMAGE_BYTES = 20 * 1024;

const SIGNATURE_NAME =
  /(?:^|[/\\])(?:image\d+|app\s*store|google\s*play|logo|signature|facebook|linkedin|twitter|instagram|spacer|pixel|icon)/i;

const BOOKING_LABEL = /little-emperors|expedia|billet|cancellation|cdsgroupe/i;

export function dropInboundImage(file: {
  filename?: string | null;
  mimeType?: string | null;
  size?: number | null;
}) {
  const name = file.filename || "";
  const image = /^image\//i.test(file.mimeType || "") || /\.(png|jpe?g|gif|webp)$/i.test(name);
  if (!image) return false;
  if (typeof file.size === "number" && file.size > 0 && file.size < SIGNATURE_IMAGE_BYTES) return true;
  return SIGNATURE_NAME.test(name);
}

export type MailSkip = { reason: string };

/**
 * Publicité, code à 6 chiffres, guide API, newsletter.
 * Un label de pièce (Little Emperors, Expedia, billet, annulation, CDS) n’est pas écarté ici.
 * `reservations-tba` et `crm` ne sont pas des labels de pièce : la file ne les
 * garde que s’ils répondent à un envoi du CRM (`email-reply-gate`).
 */
export function classifyInboundMail(input: {
  subject?: string | null;
  text?: string | null;
  label?: string | null;
}): MailSkip | null {
  if (BOOKING_LABEL.test(input.label || "")) return null;
  const subject = (input.subject || "").trim();
  const text = (input.text || "").trim();
  const blob = `${subject}\n${text}`.slice(0, 6000);
  if (looksLikeConfirmation(blob)) return null;
  if (isLoginCode(subject, text)) return { reason: "Code de connexion" };
  if (isApiGuide(blob)) return { reason: "Guide API" };
  if (isNewsletter(blob)) return { reason: "Newsletter" };
  if (isPromo(blob)) return { reason: "Publicité" };
  return null;
}

function looksLikeConfirmation(blob: string) {
  if (blob.length < 280) return false;
  return /confirmation|itin[eé]raire|e-ticket|votre (?:r[eé]servation|s[eé]jour)|booking reference|pnr/i.test(blob);
}

function isLoginCode(subject: string, text: string) {
  const compact = `${subject}\n${text}`.trim();
  if (compact.length > 900) return false;
  const six = /\b\d{6}\b/.test(compact);
  if (!six) return false;
  if (/^\d{6}$/.test(text.trim())) return true;
  return /code (?:de )?(?:connexion|v[eé]rification|s[eé]curit[eé])|verification code|security code|login code|one[- ]time|otp/i.test(
    compact
  );
}

function isApiGuide(blob: string) {
  return /api documentation|developer guide|getting started with the api|guide d['’]int[eé]gration api|webhook guide/i.test(
    blob
  );
}

function isNewsletter(blob: string) {
  return /newsletter|se d[eé]sabonner|unsubscribe|view (?:this )?(?:e-?mail )?in (?:your )?browser|voir ce message dans le navigateur/i.test(
    blob
  );
}

function isPromo(blob: string) {
  return /offre exclusive|black friday|% de r[eé]duction|code promo|promotion exceptionnelle|soldes priv[eé]es/i.test(
    blob
  );
}
