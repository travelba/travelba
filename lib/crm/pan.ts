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

/** 13 à 19 chiffres, séparés ou non par espace, tabulation, point ou tiret. */
const PAN_CANDIDATE = /\d(?:[ \t.-]?\d){12,18}/g;

/** Vrai si la suite est un PAN plausible : clé Luhn juste et groupes réguliers (3 à 6 chiffres) si séparée. */
export function looksLikePan(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!luhnValid(digits)) return false;
  const groups = raw.split(/[ \t.-]+/).filter(Boolean);
  if (groups.length === 1) return true;
  return groups.every((group) => group.length >= 3 && group.length <= 6);
}

/**
 * Masque les PAN d’un texte (Visa 16 chiffres collés, Amex 15 en 4-6-5, etc.).
 * Un numéro de dossier à 16 chiffres qui ne passe pas Luhn reste lisible.
 */
export function redactPans(text: string, mask = "[carte]") {
  return text.replace(PAN_CANDIDATE, (raw) => (looksLikePan(raw) ? mask : raw));
}
