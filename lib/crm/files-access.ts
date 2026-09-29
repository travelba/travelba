/** Photo de carte : seulement après le code maître, jamais via /api/files. */
export function isAgencyCardPath(path: string) {
  return path === "agency-cards" || path.startsWith("agency-cards/");
}

const CLIENT_CARD_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function clientCardMime(filename: string, mime?: string | null) {
  if (mime && CLIENT_CARD_EXT[mime]) return mime;
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return "";
}

/** Chemin privé. Vide si l'identifiant ou le type n'est pas acceptable. */
export function agencyCardObjectPath(bookingId: string, itemId: string, mime: string) {
  const ext = CLIENT_CARD_EXT[mime];
  if (!ext) return "";
  if (!/^[0-9a-f-]{36}$/i.test(bookingId) || !/^[0-9a-f-]{36}$/i.test(itemId)) return "";
  return `agency-cards/${bookingId}/${itemId}/carte.${ext}`;
}

export function agencyCardSiblingPaths(path: string) {
  const match = path.match(/^(agency-cards\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/carte)\.(jpg|png|webp|pdf)$/i);
  if (!match) return [];
  const current = match[2].toLowerCase();
  return ["jpg", "png", "webp", "pdf"].filter((ext) => ext !== current).map((ext) => `${match[1]}.${ext}`);
}

/** Chemin storage acceptable : relatif, sans remontée, sans segment vide. */
export function isSafeCrmPath(path: string): boolean {
  if (!path || path.length > 512) return false;
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  if (path.split("/").some((segment) => segment.length === 0)) return false;
  return true;
}

export type CustomerPathScope =
  | { kind: "own" }
  | { kind: "booking"; bookingId: string }
  | { kind: "denied" };

/**
 * Ce qu’un client connecté a le droit de demander via /api/files :
 * ses propres fichiers `customers/{id}/…`, ou un fichier de dossier `bookings/{bookingId}/…`
 * (vérifié ensuite : dossier à lui + couverture ou document publié).
 */
export function customerPathScope(path: string, customerId: string): CustomerPathScope {
  if (!isSafeCrmPath(path)) return { kind: "denied" };
  if (path.startsWith(`customers/${customerId}/`)) return { kind: "own" };
  if (path.startsWith("bookings/")) {
    const bookingId = path.split("/")[1] ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return { kind: "denied" };
    return { kind: "booking", bookingId };
  }
  return { kind: "denied" };
}
