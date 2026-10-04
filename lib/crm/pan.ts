/** Détection de numéros de carte (PAN). Aucun chiffre n’est journalisé. */

/** Luhn : vrai pour 13 à 19 chiffres dont la clé est juste. */
export function luhnValid(digits: string) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const n0 = digits.charCodeAt(i) - 48;
    if (n0 < 0 || n0 > 9) return false;
    let n = n0;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

/** Préfixes réseau : Visa 4, Mastercard 51-55 et 22-27, Amex 34/37, Discover 6011/65, JCB 35. */
const NETWORK_PREFIX = /^(?:4|5[1-5]|2[2-7]|3[47]|6(?:011|5)|35)/;

/**
 * Vrai pour une carte d’un réseau connu : préfixe, longueur réelle (Amex 15, Mastercard 16,
 * Visa / Discover / JCB 16 ou 19) et clé Luhn. Un n° de billet (13 chiffres) ou de voyage
 * Expedia (13-15 chiffres) qui passe Luhn par hasard n’en est pas une.
 */
export function networkPanDigits(digits: string) {
  if (!NETWORK_PREFIX.test(digits) || !luhnValid(digits)) return false;
  if (/^3[47]/.test(digits)) return digits.length === 15;
  if (/^(?:5[1-5]|2[2-7])/.test(digits)) return digits.length === 16;
  return digits.length === 16 || digits.length === 19;
}

/** Séparée, une carte s’écrit en groupes réguliers de 3 à 6 chiffres. */
function regularGroups(raw: string) {
  const groups = raw.split(/[ \t.-]+/).filter(Boolean);
  return groups.length === 1 || groups.every((group) => group.length >= 3 && group.length <= 6);
}

/** Vrai si la suite ressemble à une carte d’un réseau connu, groupes réguliers compris. */
export function looksLikePan(raw: string) {
  return networkPanDigits(raw.replace(/\D/g, "")) && regularGroups(raw);
}

/** 13 à 19 chiffres, séparés ou non par espace, tabulation, point ou tiret. */
const PAN_CANDIDATE = /\d(?:[ \t.-]?\d){12,18}/g;
const CONTEXT_WINDOW = 40;
/** Le texte voisin parle de carte : masqué dès que Luhn passe, même hors réseau connu. */
const CARD_CONTEXT = /\b(?:carte|card|cb|visa|mastercard|master card|amex|american express)\b/;
/** Le texte voisin parle d’un billet, d’un itinéraire, d’une confirmation, d’un dossier : ce n’est pas une carte. */
const REFERENCE_CONTEXT =
  /\b(?:billets?|e-?tickets?|tickets?|itineraires?|itinerary|confirmations?|dossiers?|ref\w*|booking|pnr)\b/;

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Masque les PAN d’un texte : réseau connu (Visa 16 collée, Amex 4-6-5, tirets, points) ou
 * mot « carte / CB / Visa… » à moins de 40 caractères. Un numéro voisin de « Billet »,
 * « Itinéraire », « Confirmation », « Dossier », « Réf », « Booking », « PNR » reste lisible.
 */
export function redactPans(text: string, mask = "[carte]") {
  return text.replace(PAN_CANDIDATE, (raw: string, offset: number) => {
    const digits = raw.replace(/\D/g, "");
    if (!luhnValid(digits) || !regularGroups(raw)) return raw;
    const before = text.slice(Math.max(0, offset - CONTEXT_WINDOW), offset);
    const after = text.slice(offset + raw.length, offset + raw.length + CONTEXT_WINDOW);
    const context = fold(`${before} ${after}`);
    if (CARD_CONTEXT.test(context)) return mask;
    if (REFERENCE_CONTEXT.test(context)) return raw;
    return networkPanDigits(digits) ? mask : raw;
  });
}
