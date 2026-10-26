const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Huit signes : l’URL reste courte, le code n’est pas devinable. */
export const TRIP_SHARE_CODE_LENGTH = 8;

export const TRIP_SHARE_ALPHABET = ALPHABET;

const CODE_RE = new RegExp(`^[${ALPHABET}]{${TRIP_SHARE_CODE_LENGTH}}$`);

export function isTripShareCode(value: string | null | undefined) {
  return CODE_RE.test(value || "");
}

export function tripShareUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/v/${code}`;
}

export function isTripShareUrl(value: string) {
  try {
    const path = new URL(value).pathname.replace(/\/+$/, "");
    return new RegExp(`^/v/${CODE_RE.source.slice(1, -1)}$`).test(path);
  } catch {
    return false;
  }
}
