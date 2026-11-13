/**
 * Images de signature et mails sans réservation : pas d’appel au modèle.
 * Même règle pour une image inline, un logo, `image.png`, `image001.png`
 * ou un nom UUID, y compris sorti d’un mail transféré.
 */

export const SIGNATURE_IMAGE_BYTES = 20 * 1024;

/** `image`, `image001`… Un nom plus long (`imagery`) reste une photo. */
const SIGNATURE_STEM =
  /^(?:image\d*(?![a-z])|app\s*store|google\s*play|logo|signature|facebook|linkedin|twitter|instagram|spacer|pixel|icon)/i;

/** Pièce générée par le client mail (Outlook, Gmail) : pas une capture de réservation. */
const UUID_STEM = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

function fileStem(name: string) {
  const base = (name.split(/[/\\]/).pop() || "").trim();
  return base.replace(/\.[^.]+$/, "");
}

const BOOKING_LABEL = /little-emperors|expedia|billet|cancellation|reservations-tba|cdsgroupe|(?:^|[^a-z])crm(?:[^a-z]|$)/i;

export function dropInboundImage(file: {
  filename?: string | null;
  mimeType?: string | null;
  size?: number | null;
}) {
  const name = file.filename || "";
  const image = /^image\//i.test(file.mimeType || "") || /\.(png|jpe?g|gif|webp|heic)$/i.test(name);
  if (!image) return false;
  if (typeof file.size === "number" && file.size > 0 && file.size < SIGNATURE_IMAGE_BYTES) return true;
  const stem = fileStem(name);
  if (!stem) return true;
  return SIGNATURE_STEM.test(stem) || UUID_STEM.test(stem);
}

export type MailSkip = { reason: string };

/**
 * Publicité, code à 6 chiffres, guide API, newsletter.
 * Un label suivi (Little Emperors, Expedia, billet, annulation, reservations-tba, CDS)
 * n’est pas écarté ici : il reste dans la file. La notification, elle, ne part
 * que pour une réponse à un envoi du CRM (`shouldNotifyInboundMail`).
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
  return /newsletter|se d[eé]sabonner|unsubscribe|view (?:this )?in (?:your )?browser|voir ce message dans le navigateur/i.test(
    blob
  );
}

function isPromo(blob: string) {
  return /offre exclusive|black friday|% de r[eé]duction|code promo|promotion exceptionnelle|soldes priv[eé]es/i.test(
    blob
  );
}
