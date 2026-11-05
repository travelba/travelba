/**
 * Réservation client chez le fournisseur : règles, corps d’appel, délais.
 * Aucun numéro de carte n’est journalisé. Le nom du fournisseur ne sort pas d’ici.
 */

export const LE_PLACE_WINDOW_MS = 120_000;

export type LePlaceClaim =
  | { action: "place" }
  | { action: "resume" }
  | { action: "wait"; message: string }
  | { action: "done" };

const WAIT = "Une réservation est déjà en cours. Réessayez dans un instant.";

export function claimLeBooking(input: {
  existing: { phase: string; leBookingId: number | null; placingAtMs: number | null } | null;
  nowMs: number;
  otherFresh: boolean;
}): LePlaceClaim {
  const row = input.existing;
  if (row?.leBookingId) {
    if (row.phase === "confirmed" || row.phase === "cancelled" || row.phase === "refunding") return { action: "done" };
    return { action: "resume" };
  }
  if (row && (row.phase === "confirmed" || row.phase === "transmitted" || row.phase === "confirming")) {
    return { action: "done" };
  }
  if (row?.phase === "placing") {
    const age = row.placingAtMs == null ? LE_PLACE_WINDOW_MS : input.nowMs - row.placingAtMs;
    if (age < LE_PLACE_WINDOW_MS) return { action: "wait", message: WAIT };
  }
  if (input.otherFresh) return { action: "wait", message: WAIT };
  return { action: "place" };
}

export type AdoptedBooking = { id: number; confirmation: string | null };

export function adoptLeBooking(
  bookings: {
    id: number;
    hotel_id: number | null;
    check_in: string | null;
    check_out: string | null;
    guest_names: string[];
    confirmation_number: string | null;
    state?: string | null;
  }[],
  needle: { hotelId: number; checkIn: string; checkOut: string; guest: string }
): AdoptedBooking | "ambiguous" | null {
  const guest = needle.guest.replace(/\s+/g, " ").trim().toLowerCase();
  const hits = bookings.filter((row) => {
    const state = (row.state || "").toLowerCase();
    if (state === "cancelled" || state === "canceled") return false;
    return (
      row.hotel_id === needle.hotelId &&
      row.check_in === needle.checkIn &&
      row.check_out === needle.checkOut &&
      row.guest_names.some((name) => name.replace(/\s+/g, " ").trim().toLowerCase() === guest)
    );
  });
  if (hits.length > 1) return "ambiguous";
  if (hits.length === 1) return { id: hits[0].id, confirmation: hits[0].confirmation_number };
  return null;
}

export function leCardBrand(pan: string): "VISA" | "MASTERCARD" | "AMEX" | null {
  const digits = pan.replace(/\D/g, "");
  if (/^4\d{12,18}$/.test(digits)) return "VISA";
  if (/^3[47]\d{13}$/.test(digits)) return "AMEX";
  if (/^(?:5[1-5]\d{14}|2(?:2[2-9]\d|[3-6]\d{2}|7[01]\d|720)\d{12})$/.test(digits)) return "MASTERCARD";
  return null;
}

/** Carte d’agence, en mémoire le temps de l’appel. `requiresCvc` faux : le cryptogramme n’est pas envoyé. */
export function leCreditCard(input: {
  pan: string;
  cvc: string;
  expMonth: number;
  expYear: number;
  name: string;
  requiresCvc: boolean | null;
}): Record<string, unknown> | null {
  const number = input.pan.replace(/\D/g, "");
  const brand = leCardBrand(number);
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!brand || number.length < 14 || number.length > 19 || name.length < 3) return null;
  if (input.expMonth < 1 || input.expMonth > 12 || input.expYear < 2000) return null;
  const card: Record<string, unknown> = {
    number,
    name,
    brand_name: brand,
    exp_month: input.expMonth,
    exp_year: input.expYear,
  };
  if (input.requiresCvc !== false) {
    const cvc = input.cvc.replace(/\D/g, "");
    if ((brand === "AMEX" && cvc.length !== 4) || (brand !== "AMEX" && cvc.length !== 3)) return null;
    card.cvc = cvc;
  }
  return card;
}

export function redactCardText(value: string) {
  return value
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, "••••")
    .replace(/\b(cvc|cvv|csc)\s*[:=]?\s*\d{3,4}\b/gi, "$1 •••");
}

export function leSessionExpired(message: string) {
  const text = message.toLowerCase();
  return /session/.test(text) && /expir|invalid|unknown|not found|mismatch|introuv|unauthor/.test(text);
}

export function etaHour(value: string | null | undefined): string | null {
  const match = String(value || "").match(/(\d{1,2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return String(hour);
}

export function leBookingRequest(input: {
  start: string;
  end: string;
  sessionId: string;
  rateIndex: string;
  hotelId: number;
  guestName: string;
  guestEmail: string;
  eta: string | null;
  rooms: { guestName: string; adults: number; children: { age: number }[] }[];
  card: Record<string, unknown> | null;
}) {
  return {
    start_date: input.start,
    end_date: input.end,
    session_id: input.sessionId,
    rate_index: input.rateIndex,
    hotel_id: input.hotelId,
    guest_name: input.guestName,
    guest_email: input.guestEmail,
    ...(input.eta ? { eta: input.eta } : {}),
    ...(input.card ? { credit_card: input.card } : {}),
    rooms: input.rooms.map((room) => ({
      guest_name: room.guestName,
      send_email_to_guest: false,
      adults: room.adults,
      children: room.children.map((child) => ({ age: child.age })),
    })),
  };
}

/** Copie sans carte, pour un journal. Le corps envoyé n’est pas celui-ci. */
export function leBookingRequestWithoutCard(body: Record<string, unknown>) {
  const copy = { ...body };
  delete copy.credit_card;
  return copy;
}

function parisOffsetMs(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"), pick("second"));
  return asUtc - instant.getTime();
}

/** Heure murale lue comme l’heure de Paris. */
export function instantInParis(wall: string): Date | null {
  const match = wall.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] != null ? Number(match[4]) : 0;
  const minute = match[5] != null ? Number(match[5]) : 0;
  const second = match[6] != null ? Number(match[6]) : 0;
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const probe = new Date(utcGuess);
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  const offset = parisOffsetMs(probe);
  const instant = new Date(utcGuess - offset);
  const again = parisOffsetMs(instant);
  return again === offset ? instant : new Date(utcGuess - again);
}

/** Instant exact. Une heure sans fuseau est l’heure de Paris. Une date seule n’invente pas d’heure. */
export function leDeadlineInstantParis(value: string | null | undefined): Date | null {
  const raw = String(value || "").trim();
  if (!raw || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const dated = new Date(raw);
    return Number.isNaN(dated.getTime()) ? null : dated;
  }
  return instantInParis(raw);
}

export function leDeadlineParisLabel(value: string | null | undefined): string | null {
  const instant = leDeadlineInstantParis(value);
  if (!instant) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(instant)
    .replace(/[\u202f\u00a0]/g, " ");
}

/** Encore avant la limite. Une date seule se compare au jour. Une heure se compare à l’instant. */
export function deadlineStillOpen(deadline: string | null | undefined, nowIso: string): boolean {
  const raw = String(deadline || "").trim();
  if (!raw) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return nowIso.slice(0, 10) < raw;
  const instant = leDeadlineInstantParis(raw);
  if (!instant) return false;
  const now = Date.parse(nowIso.length === 10 ? `${nowIso}T00:00:00Z` : nowIso);
  return Number.isFinite(now) && now < instant.getTime();
}

export function pricesDiffer(quotedCents: number, freshCents: number) {
  return quotedCents !== freshCents;
}

/** Voyageur principal envoyé au fournisseur : prénom puis nom, sans liste. */
export function lePrimaryGuest(value: string): string | null {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 80 || /[,;]/.test(clean)) return null;
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length < 2 || parts[parts.length - 1].length < 2) return null;
  return clean;
}

export const PARTY_MISMATCH = "Ce tarif n’est plus disponible pour ce nombre de voyageurs. Choisissez une autre chambre.";

/**
 * Le nombre d’adultes est le plus grand entre la recherche et les personnes nommées
 * (le principal, plus chaque accompagnant). Un second passage ne les compte pas deux fois.
 * Les enfants déjà saisis restent des enfants.
 */
export function partyWithCompanions<T extends { adults: number; children: { age: number }[] }>(
  stored: T[],
  companionsPerRoom: number[]
): T[] {
  return stored.map((room, index) => ({
    ...room,
    adults: Math.max(room.adults, 1 + Math.max(0, companionsPerRoom[index] || 0)),
  }));
}

export function partyChanged<T extends { adults: number; children: { age: number }[] }>(stored: T[], next: T[]) {
  if (stored.length !== next.length) return true;
  return stored.some((room, index) => {
    const other = next[index];
    if (room.adults !== other.adults || room.children.length !== other.children.length) return true;
    return room.children.some((child, at) => child.age !== other.children[at]?.age);
  });
}

/** Message client. Le texte amont n’est pas recopié s’il peut nommer le fournisseur. */
export function leClientRefusal(status: number, upstream: string): string {
  const text = upstream.toLowerCase();
  if (/session/.test(text) && /expir|invalid|unknown|not found|mismatch/.test(text)) {
    return "La saisie de la carte a expiré. Recommencez.";
  }
  if (/guest.?name|surname|first.?name/.test(text)) {
    return "Indiquez le prénom et le nom du voyageur principal, une personne par ligne.";
  }
  if (/adult|child|occupan|room/.test(text)) return PARTY_MISMATCH;
  if (status === 422) return "La réservation a été refusée. Vérifiez les voyageurs, puis réessayez.";
  return "La réservation n’a pas abouti. Réessayez dans un instant.";
}

const WIDGET_HOSTS = new Set(["api-staging.littleemperors.com", "api.littleemperors.com"]);

/** Iframe de saisie. L’adresse reste sur l’hôte du widget ; la carte n’arrive pas ici. */
export function leCardWidgetUrl(origin: string, sessionId: string): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !WIDGET_HOSTS.has(url.hostname)) return null;
  const session = sessionId.trim();
  if (!session || session.length > 120 || /[^A-Za-z0-9._-]/.test(session)) return null;
  return `${url.origin}/widgets/credit-card?session_id=${encodeURIComponent(session)}`;
}

export function safeCardWidgetUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !WIDGET_HOSTS.has(url.hostname) || url.pathname !== "/widgets/credit-card") return null;
  const session = url.searchParams.get("session_id") || "";
  if (!session || /[^A-Za-z0-9._-]/.test(session)) return null;
  return leCardWidgetUrl(url.origin, session);
}

/** Message du cadre. Une autre origine est ignorée. */
export function leWidgetSignal(input: { origin: string; allowedOrigin: string; data: unknown }): "ready" | "error" | "ignore" {
  if (!input.allowedOrigin || input.origin !== input.allowedOrigin) return "ignore";
  if (!input.data || typeof input.data !== "object") return "ignore";
  const success = (input.data as { success?: unknown }).success;
  if (success === true) return "ready";
  if (success === false) return "error";
  return "ignore";
}

/** Conditions montrées avant la confirmation. Aucun nom de fournisseur. */
export function clientPaymentTerms(input: {
  paymentDescription: string | null;
  requiresCvc: boolean | null;
  deadlineLabel: string | null;
  free: boolean;
}): string {
  const raw = (input.paymentDescription || "").replace(/little\s*emperors/gi, "");
  const deposit = /deposit|acompte|prélev|prelev/i.test(raw) && !/no deposit/i.test(raw);
  const lines = [
    deposit
      ? "L’hôtel peut prélever un acompte sur cette carte."
      : "La carte garantit la réservation. L’hôtel prélève selon les conditions du tarif.",
  ];
  if (input.requiresCvc) lines.push("Le cryptogramme est demandé.");
  if (input.free && input.deadlineLabel) lines.push(`Annulation gratuite jusqu’au ${input.deadlineLabel} (heure de Paris).`);
  else lines.push("Ce tarif ne prévoit pas d’annulation gratuite.");
  return lines.join(" ");
}
