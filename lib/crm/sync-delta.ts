/**
 * Fenêtre et comparaison des synchros externes.
 * Le curseur vit dans crm_integrations (provider sync:…), jamais sur la ligne du jeton.
 * L’API MCP n’est pas concernée : listLittleEmperorsBookings reste la liste complète.
 */

import { revolutInboxDraft } from "./revolut-inbox";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Premier passage Revolut (cron) : les 14 jours déjà lus aujourd’hui. Ensuite, 2 jours de recouvrement. */
export const REVOLUT_FIRST_LOOKBACK_MS = 14 * DAY_MS;
export const REVOLUT_OVERLAP_MS = 2 * DAY_MS;

/** Le bouton Synchroniser, sans curseur, garde les 30 jours. Le cron part de 14. */
export const REVOLUT_MANUAL_LOOKBACK_MS = 30 * DAY_MS;

/**
 * Stripe filtre sur la date de création du PaymentIntent, pas sur la date de succès.
 * Un prélèvement créé il y a plusieurs jours peut réussir plus tard : 6 jours de recouvrement.
 * Le premier passage reste les 14 jours.
 */
export const STRIPE_FIRST_LOOKBACK_MS = 14 * DAY_MS;
export const STRIPE_OVERLAP_MS = 6 * DAY_MS;

/** Une autorisation Pliant se confirme dans les jours qui suivent. Premier passage : tout l’historique. */
export const PLIANT_OVERLAP_MS = 10 * DAY_MS;

/** Statuts Twilio du téléphone de relecture : 7 jours la première fois, puis 2 jours. */
export const TWILIO_FIRST_LOOKBACK_MS = 7 * DAY_MS;
export const TWILIO_OVERLAP_MS = 2 * DAY_MS;

export function syncSinceIso(input: {
  cursor: string | null;
  now: number;
  overlapMs: number;
  firstLookbackMs: number;
}) {
  const cursorMs = input.cursor ? Date.parse(input.cursor) : Number.NaN;
  const start = Number.isFinite(cursorMs)
    ? Math.min(input.now, cursorMs) - input.overlapMs
    : input.now - input.firstLookbackMs;
  return new Date(Math.min(start, input.now)).toISOString();
}

export function syncSinceUnix(input: {
  cursor: string | null;
  now: number;
  overlapMs: number;
  firstLookbackMs: number;
}) {
  return Math.floor(Date.parse(syncSinceIso(input)) / 1000);
}

export function sameText(left: unknown, right: unknown) {
  const text = (value: unknown) => {
    if (value == null) return "";
    return String(value).trim();
  };
  return text(left) === text(right);
}

export function sameMoney(left: unknown, right: unknown) {
  if ((left == null || left === "") && (right == null || right === "")) return true;
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.round(a * 100) === Math.round(b * 100);
}

export function sameCents(left: unknown, right: unknown) {
  if (left == null && right == null) return true;
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.round(a) === Math.round(b);
}

export function sameInstant(left: unknown, right: unknown) {
  if ((left == null || left === "") && (right == null || right === "")) return true;
  const a = Date.parse(String(left));
  const b = Date.parse(String(right));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return String(left) === String(right);
  return Math.abs(a - b) < 1000;
}

export function sameId(left: unknown, right: unknown) {
  if ((left == null || left === "") && (right == null || right === "")) return true;
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a === b;
}

export function sameList(left: unknown, right: unknown) {
  const list = (value: unknown) => (Array.isArray(value) ? value.map((item) => String(item)) : []);
  const a = list(left);
  const b = list(right);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(row).sort()) out[key] = canonicalize(row[key]);
    return out;
  }
  return value;
}

/** Un texte vide côté API ne compte pas comme un changement : l’enrichissement l’a déjà rempli. */
export function sameFilled(stored: unknown, incoming: unknown) {
  const next = incoming == null ? "" : String(incoming).trim();
  if (!next) return true;
  return sameText(stored, next);
}

export type RevolutStoredRow = {
  amount?: unknown;
  currency?: unknown;
  direction?: unknown;
  counterparty_name?: unknown;
  counterparty_iban?: unknown;
  reference?: unknown;
  booked_at?: unknown;
  raw?: unknown;
};

type RevolutCompareInput = {
  id?: string;
  type?: string | null;
  state?: string | null;
  reference?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  merchant?: { name?: string | null } | null;
  legs?: Array<{
    amount?: number;
    currency?: string;
    description?: string;
    counterparty?: { name?: string; iban?: string; account_no?: string };
  }> | null;
};

/** Vrai : la ligne en base a déjà le montant, l’expéditeur, le statut et le type. Rien à écrire. */
export function revolutStoredMatches(stored: RevolutStoredRow | null, tx: RevolutCompareInput) {
  if (!tx.id) return true;
  const draft = revolutInboxDraft(tx);
  if (!draft) return true;
  if (!stored) return false;
  const raw = stored.raw && typeof stored.raw === "object" ? (stored.raw as Record<string, unknown>) : {};
  return (
    sameMoney(stored.amount, draft.amount) &&
    sameText(stored.currency, draft.currency) &&
    sameText(stored.direction, draft.direction) &&
    sameText(stored.counterparty_name, draft.counterparty_name) &&
    sameText(stored.counterparty_iban, draft.counterparty_iban) &&
    sameText(stored.reference, draft.reference) &&
    sameInstant(stored.booked_at, draft.booked_at) &&
    sameText(raw.state, tx.state) &&
    sameText(raw.type, tx.type)
  );
}

export type StripeStoredRow = {
  amount?: unknown;
  currency?: unknown;
  direction?: unknown;
  payer_name?: unknown;
  payer_email?: unknown;
  reference?: unknown;
  method?: unknown;
  last4?: unknown;
  booked_at?: unknown;
  raw?: unknown;
  status?: unknown;
};

export function stripeStoredMatches(
  stored: StripeStoredRow | null,
  draft: {
    amount: number;
    currency: string;
    direction: string;
    payer_name: string | null;
    payer_email: string | null;
    reference: string | null;
    method: string;
    last4: string | null;
    booked_at: string | null;
    raw: Record<string, unknown>;
  }
) {
  if (!stored) return false;
  return (
    sameMoney(stored.amount, draft.amount) &&
    sameText(stored.currency, draft.currency) &&
    sameText(stored.direction, draft.direction) &&
    sameText(stored.payer_name, draft.payer_name) &&
    sameText(stored.payer_email, draft.payer_email) &&
    sameText(stored.reference, draft.reference) &&
    sameText(stored.method, draft.method) &&
    sameText(stored.last4, draft.last4) &&
    sameInstant(stored.booked_at, draft.booked_at) &&
    stableJson(stored.raw || {}) === stableJson(draft.raw)
  );
}

const PLIANT_KEYS = [
  "status",
  "type",
  "merchant",
  "billing_currency",
  "transaction_currency",
  "card_label",
  "card_last4",
  "holder_name",
  "category",
  "comment",
] as const;

export function pliantStoredMatches(stored: Record<string, unknown> | null, next: Record<string, unknown>) {
  if (!stored) return false;
  if (!sameCents(stored.billing_cents, next.billing_cents)) return false;
  if (!sameCents(stored.transaction_cents, next.transaction_cents)) return false;
  if (!sameInstant(stored.booked_at, next.booked_at)) return false;
  if (!sameText(stored.card_id, next.card_id)) return false;
  for (const key of PLIANT_KEYS) {
    if (next[key] === undefined) continue;
    if (!sameText(stored[key], next[key])) return false;
  }
  return true;
}

export function pliantCreatedAtMs(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const raw = row.createdAt || row.created_at || row.authorizedAt || row.confirmedAt;
  if (typeof raw !== "string") return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Page triée du plus récent au plus ancien : on garde la page, et on s’arrête dès qu’une ligne est trop vieille. */
export function pliantRowsWithinSince(rows: unknown[], sinceMs: number) {
  const kept: unknown[] = [];
  let done = false;
  for (const row of rows) {
    const at = pliantCreatedAtMs(row);
    if (at != null && at < sinceMs) {
      done = true;
      continue;
    }
    kept.push(row);
  }
  return { kept, done };
}

export type LeSnap = {
  status?: string | null;
  state?: string | null;
  confirmation_number?: string | null;
  hotel_id?: unknown;
  hotel_name?: string | null;
  city?: string | null;
  address?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  total_cost?: string | null;
  currency?: string | null;
  is_cancellable?: boolean | null;
  cancellation_deadline?: string | null;
  guest_names?: string[] | null;
  cancellation_policies?: string[] | null;
  room_types?: string[] | null;
  benefits?: string[] | null;
  rooms?: unknown;
  crm_booking_id?: string | null;
  last_error?: string | null;
  country?: string | null;
  website?: string | null;
  candidates?: unknown;
};

function leCancelled(state: string | null | undefined) {
  const normalized = String(state || "").trim().toLowerCase();
  return normalized === "cancelled" || normalized === "canceled";
}

/** Faux seulement si la ligne stockée porte déjà le même séjour. Une ligne sans dossier reste à relire. */
export function leBookingNeedsWork(stored: LeSnap | null, booking: LeSnap) {
  if (!stored) return true;
  if ((stored.status || "") === "unmatched") return true;
  if (leCancelled(booking.state) && !leCancelled(stored.state)) return true;
  return !leListEqual(stored, booking);
}

export function leListEqual(stored: LeSnap, booking: LeSnap) {
  if (!sameText(stored.state, booking.state)) return false;
  if (!sameText(stored.confirmation_number, booking.confirmation_number)) return false;
  if (!sameId(stored.hotel_id, booking.hotel_id)) return false;
  if (!sameFilled(stored.hotel_name, booking.hotel_name)) return false;
  if (!sameFilled(stored.city, booking.city)) return false;
  if (!sameFilled(stored.address, booking.address)) return false;
  if (!sameText(stored.check_in, booking.check_in)) return false;
  if (!sameText(stored.check_out, booking.check_out)) return false;
  if (!sameText(stored.total_cost, booking.total_cost)) return false;
  if (!sameText(stored.currency, booking.currency)) return false;
  if (Boolean(stored.is_cancellable) !== Boolean(booking.is_cancellable)) return false;
  if (!sameText(stored.cancellation_deadline, booking.cancellation_deadline)) return false;
  if (!sameList(stored.guest_names, booking.guest_names)) return false;
  if (!sameList(stored.cancellation_policies, booking.cancellation_policies)) return false;
  if (!sameList(stored.room_types, booking.room_types)) return false;
  if (!sameList(stored.benefits, booking.benefits)) return false;
  if (booking.rooms !== undefined && stableJson(stored.rooms || []) !== stableJson(booking.rooms || [])) return false;
  return true;
}

export function lePayloadMatches(stored: LeSnap, payload: LeSnap & { raw?: unknown }) {
  const raw = payload.raw && typeof payload.raw === "object" ? (payload.raw as LeSnap) : null;
  const booking: LeSnap = {
    ...payload,
    benefits: raw?.benefits ?? payload.benefits,
    rooms: raw && "rooms" in raw ? raw.rooms : payload.rooms,
  };
  if (!leListEqual(stored, booking)) return false;
  if ((stored.status || "") !== (payload.status || "")) return false;
  if ((stored.crm_booking_id || null) !== (payload.crm_booking_id || null)) return false;
  if (!sameText(stored.last_error, payload.last_error)) return false;
  if (payload.country && !sameText(stored.country, payload.country)) return false;
  if (!sameFilled(stored.website, payload.website)) return false;
  if (stableJson(stored.candidates || []) !== stableJson(payload.candidates || [])) return false;
  return true;
}

export function mb3mBalanceUnchanged(stored: unknown, next: number) {
  return sameMoney(stored, next);
}

export function mb3mPieceUnchanged(
  stored: {
    folder_id?: unknown;
    amount?: unknown;
    lines?: unknown;
    transaction_ids?: unknown;
    document_id?: unknown;
    printed_at?: unknown;
  },
  payload: {
    folder_id?: unknown;
    amount?: unknown;
    lines?: unknown;
    transaction_ids?: unknown;
    document_id?: unknown;
    printed_at?: unknown;
  }
) {
  const ids = (value: unknown) =>
    (Array.isArray(value) ? value.map((item) => String(item)) : []).slice().sort();
  return (
    sameText(stored.folder_id, payload.folder_id) &&
    sameMoney(stored.amount, payload.amount) &&
    stableJson(stored.lines || []) === stableJson(payload.lines || []) &&
    stableJson(ids(stored.transaction_ids)) === stableJson(ids(payload.transaction_ids)) &&
    sameText(stored.document_id, payload.document_id) &&
    sameInstant(stored.printed_at, payload.printed_at)
  );
}

export function mb3mPaymentUnchanged(
  stored: {
    booking_id?: unknown;
    mb3m_payment_number?: unknown;
    mb3m_invoice_number?: unknown;
    mb3m_matching_id?: unknown;
    amount?: unknown;
    matched_amount?: unknown;
  },
  next: {
    booking_id?: unknown;
    mb3m_payment_number?: unknown;
    mb3m_invoice_number?: unknown;
    mb3m_matching_id?: unknown;
    amount?: unknown;
    matched_amount?: unknown;
  }
) {
  return (
    sameText(stored.booking_id, next.booking_id) &&
    sameText(stored.mb3m_payment_number, next.mb3m_payment_number) &&
    sameText(stored.mb3m_invoice_number, next.mb3m_invoice_number) &&
    sameText(stored.mb3m_matching_id, next.mb3m_matching_id) &&
    sameMoney(stored.amount, next.amount) &&
    sameMoney(stored.matched_amount, next.matched_amount)
  );
}

/** Jour UTC du filtre Twilio `DateSent>=`. Null si le curseur est illisible. */
export function twilioSentDay(sinceIso: string | null) {
  if (!sinceIso) return null;
  const ms = Date.parse(sinceIso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function twilioMessagesQuery(accountSid: string, to: string, sinceIso: string | null) {
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`);
  const params = new URLSearchParams({ To: to, PageSize: "50" });
  const day = twilioSentDay(sinceIso);
  url.search = day ? `${params.toString()}&${encodeURIComponent("DateSent>=")}=${day}` : params.toString();
  return url;
}
