import { randomInt } from "node:crypto";
import { isWhatsappTypeMedia } from "./concierge-notices";
import { whatsappAddress, type WhatsappSendResult } from "./whatsapp";
import { sendWhatsappSession } from "./whatsapp-session";
import { isSafeCrmPath } from "./files-access";
import { toE164 } from "./phone";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Huit signes : l’URL reste courte, le code n’est pas devinable. */
export const TRIP_SHARE_CODE_LENGTH = 8;

const CODE_RE = new RegExp(`^[${ALPHABET}]{${TRIP_SHARE_CODE_LENGTH}}$`);

export function tripShareCode(length = TRIP_SHARE_CODE_LENGTH) {
  let code = "";
  for (let i = 0; i < length; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

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

/** Texte envoyé depuis le WhatsApp Business de l’agence. Pas d’accès au compte. */
export function tripShareMessage(input: { firstName: string; title: string; url: string }) {
  const name = input.firstName.replace(/[\r\n]+/g, " ").trim();
  const title = input.title.replace(/[\r\n]+/g, " ").trim() || "votre voyage";
  const hello = name ? `Bonjour ${name},` : "Bonjour,";
  return [hello, "", `Voici le voyage ${title}.`, input.url, "", "Travel Business Agency"].join("\n");
}

const HIDDEN_ON_PUBLIC_PAGE = new Set(["fee", "expense", "insurance", "visa", "checkin"]);

/** Itinéraire public : pas les frais, la facturation, ni les formalités. */
export function publicTripItems<T extends { kind: string; visible_to_client?: boolean | null }>(items: T[]) {
  return items.filter((item) => item.visible_to_client !== false && !HIDDEN_ON_PUBLIC_PAGE.has(item.kind));
}

/**
 * Un visiteur du lien ne lit que la couverture et les pièces publiées de CE dossier.
 * Jamais un fichier `customers/…` (passeport, pièce d’identité).
 */
export function tripShareAllowsPath(
  path: string,
  booking: { id: string; cover_image_path?: string | null },
  docs: { storage_path?: string | null; visible_to_client?: boolean | null }[]
) {
  if (!isSafeCrmPath(path)) return false;
  if (!path.startsWith(`bookings/${booking.id}/`)) return false;
  if (booking.cover_image_path && path === booking.cover_image_path) return true;
  return docs.some((doc) => doc.visible_to_client !== false && doc.storage_path === path);
}

export type ShareCompanion = {
  travelerId: string;
  companionId: string;
  firstName: string;
  lastName: string;
  hasPhone: boolean;
};

export function companionsForShare(
  travelers: {
    id: string;
    companion_id: string | null;
    is_account_holder: boolean;
    first_name: string | null;
    last_name: string | null;
  }[],
  companions: { id: string; first_name: string; last_name: string; phone?: string | null }[]
): ShareCompanion[] {
  const seen = new Set<string>();
  const rows: ShareCompanion[] = [];
  for (const traveler of travelers) {
    if (traveler.is_account_holder) continue;
    const companion = companions.find((row) => row.id === traveler.companion_id) || null;
    const key = companion?.id || traveler.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const firstName = (traveler.first_name || companion?.first_name || "").trim();
    const lastName = (traveler.last_name || companion?.last_name || "").trim();
    if (!firstName && !lastName) continue;
    rows.push({
      travelerId: traveler.id,
      companionId: companion?.id || "",
      firstName: firstName || "Accompagnateur",
      lastName,
      hasPhone: Boolean(companion && whatsappAddress(companion.phone)),
    });
  }
  return rows;
}

export function planTripShareSend(input: {
  companionId: string;
  travelers: { companion_id: string | null; is_account_holder: boolean }[];
  companions: { id: string; first_name: string; phone?: string | null }[];
}):
  | { ok: true; phone: string; firstName: string }
  | { ok: false; reason: "not_on_trip" | "no_phone" } {
  const onTrip = input.travelers.some(
    (traveler) => !traveler.is_account_holder && traveler.companion_id === input.companionId
  );
  if (!onTrip || !input.companionId) return { ok: false, reason: "not_on_trip" };
  const companion = input.companions.find((row) => row.id === input.companionId);
  if (!companion) return { ok: false, reason: "not_on_trip" };
  if (!whatsappAddress(companion.phone)) return { ok: false, reason: "no_phone" };
  return { ok: true, phone: companion.phone!.trim(), firstName: companion.first_name };
}

/** null = champ absent (ne pas écraser). false = valeur illisible. */
export function storedCompanionPhone(value: unknown): { ok: true; phone: string | null } | { ok: false } {
  if (value == null || String(value).trim() === "") return { ok: true, phone: null };
  const e164 = toE164(String(value), "FR");
  if (!e164) return { ok: false };
  return { ok: true, phone: e164 };
}

export async function sendTripShareWhatsapp(input: {
  phone: string | null | undefined;
  firstName: string;
  title: string;
  url: string;
  mediaUrl?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<WhatsappSendResult> {
  const to = whatsappAddress(input.phone);
  if (!to) return { ok: false, reason: "no_phone" };
  if (!isTripShareUrl(input.url)) return { ok: false, reason: "rejected" };
  const body = tripShareMessage({
    firstName: input.firstName,
    title: input.title,
    url: input.url,
  });
  if (body.includes("/mon-compte") || body.includes("/e/")) {
    return { ok: false, reason: "rejected" };
  }
  const mediaUrl = input.mediaUrl && isWhatsappTypeMedia(input.mediaUrl) ? input.mediaUrl : null;
  const result = await sendWhatsappSession({ to, body, mediaUrl, fetchImpl: input.fetchImpl });
  if (result.ok) return { ok: true, sid: result.sid };
  if (result.detail === "not_configured") return { ok: false, reason: "not_configured" };
  return { ok: false, reason: "rejected", detail: result.detail };
}
