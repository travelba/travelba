const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Huit signes : l’URL reste courte, le code n’est pas devinable. */
export const ENTRY_CODE_LENGTH = 8;

export { ALPHABET as ENTRY_CODE_ALPHABET };

export function isEntryCode(value: string) {
  return new RegExp(`^[${ALPHABET}]{${ENTRY_CODE_LENGTH}}$`).test(value);
}

/**
 * Code du lien, quel que soit l’hôte.
 * L’aperçu WhatsApp est `/e/c/CODE` : une autre adresse que `/e/CODE`,
 * pour ne pas réutiliser une carte déjà mise en cache.
 */
export function entryCodeFromLink(link: string) {
  try {
    const path = new URL(link).pathname.replace(/\/+$/, "");
    const code = path.split("/").pop() || "";
    if (!isEntryCode(code)) return null;
    if (path !== `/e/${code}` && path !== `/e/c/${code}`) return null;
    return code;
  } catch {
    return null;
  }
}

/** Suffixe du bouton `https://travelba.fr/e/{{2}}`. */
export function entryButtonSuffix(code: string) {
  return `c/${code}`;
}

export function entryLinkUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/e/c/${code}`;
}
