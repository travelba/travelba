import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmationRefsAlign, firstNamesAlign, lastNamesClose } from "@/lib/crm/email-match";
import { isBookingCancellationLabel } from "@/lib/crm/gmail-parse";
import { isCancellationExtract, parseExtractPayloadSafe, type BookingExtract } from "@/lib/crm/ingest-types";
import { hotelBrandsAlign, hotelStaysOverlapNights } from "@/lib/crm/item-match";
import { isLeCancelled } from "@/lib/crm/little-emperors";
import { nameTokens } from "@/lib/crm/person-match";
import { isActiveItem } from "@/lib/crm/types";

/** Annulation d’une carte encore active. La routine peut alerter. */
export const CANCELLATION_ACTIVE = "annulée";
/** Une confirmation plus récente couvre le même hôtel, la même personne et des dates qui se croisent. */
export const CANCELLATION_REPLACED = "remplacée";
/** L’annulation est antérieure à la confirmation active. Elle est ignorée. */
export const CANCELLATION_HISTORICAL = "historique";

export type CancellationSuivi =
  | typeof CANCELLATION_ACTIVE
  | typeof CANCELLATION_REPLACED
  | typeof CANCELLATION_HISTORICAL;

export type CancellationVerdict = {
  suivi: CancellationSuivi | null;
  alerte: boolean;
  remplacee_par: string | null;
};

export type StayAnchor = {
  confirmation: string | null;
  hotel: string | null;
  hotelId: number | null;
  people: string[];
  checkIn: string | null;
  checkOut: string | null;
  active: boolean;
  /** Identifiant Little Emperors : plus grand = confirmation plus récente. */
  leId: number | null;
  /** Horodatage de la confirmation ou du mail. */
  at: string | null;
};

const QUIET: CancellationVerdict = { suivi: null, alerte: false, remplacee_par: null };

function day(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
}

function hotelIdOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function usablePerson(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (/\b(adulte|adultes|chambre|chambres|room|rooms|guest|guests)\b/i.test(text)) return false;
  return text.split(/\s+/).filter(Boolean).length >= 2;
}

function personLines(...groups: (string | null | undefined)[][]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const value of group) {
      const line = (value || "").replace(/\s+/g, " ").trim();
      if (!usablePerson(line)) continue;
      const key = line.toLocaleLowerCase("fr");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }
  return out;
}

function interpretations(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [];
  return [
    { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] },
    { first: parts.slice(1).join(" "), last: parts[0] },
  ];
}

function givenClose(a: string, b: string) {
  if (firstNamesAlign(a, b)) return true;
  const left = nameTokens(a);
  const right = nameTokens(b);
  return left.some((token) =>
    right.some((other) => {
      if (token === other) return true;
      if (token.length < 4 || other.length < 4) return false;
      return token.startsWith(other) || other.startsWith(token) || lastNamesClose(token, other);
    })
  );
}

export function personNamesAlign(a: string, b: string) {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right) return false;
  if (left.localeCompare(right, "fr", { sensitivity: "base" }) === 0) return true;
  return interpretations(left).some((person) =>
    interpretations(right).some(
      (other) => lastNamesClose(person.last, other.last) && givenClose(person.first, other.first)
    )
  );
}

export function peopleShare(left: string[], right: string[]) {
  return left.some((name) => right.some((other) => personNamesAlign(name, other)));
}

function sameHotel(a: StayAnchor, b: StayAnchor) {
  if (a.hotelId != null && b.hotelId != null) return a.hotelId === b.hotelId;
  return hotelBrandsAlign(a.hotel, b.hotel);
}

function nightsOverlap(a: StayAnchor, b: StayAnchor) {
  return hotelStaysOverlapNights(
    { start_at: a.checkIn, end_at: a.checkOut },
    { start_at: b.checkIn, end_at: b.checkOut }
  );
}

function isNewer(candidate: StayAnchor, cancellation: StayAnchor) {
  if (candidate.leId != null && cancellation.leId != null) return candidate.leId > cancellation.leId;
  if (candidate.at && cancellation.at) return candidate.at > cancellation.at;
  return false;
}

function preferredReplacement(rows: StayAnchor[]) {
  const ordered = [...rows].sort((a, b) => {
    const id = (b.leId ?? -1) - (a.leId ?? -1);
    if (id !== 0) return id;
    return (b.at || "").localeCompare(a.at || "");
  });
  return (ordered[0]?.confirmation || "").trim() || null;
}

/**
 * Une annulation fournisseur n’alerte que si son numéro est celui d’une carte active.
 * Une confirmation plus récente, même hôtel, même personne, dates qui se croisent : « remplacée ».
 * Une annulation antérieure à la confirmation active : « historique ».
 */
export function supplierCancellationVerdict(cancellation: StayAnchor, known: StayAnchor[]): CancellationVerdict {
  const active = known.filter((row) => row.active && !(row.leId != null && row.leId === cancellation.leId));
  if (active.some((row) => confirmationRefsAlign(row.confirmation, cancellation.confirmation))) {
    return { suivi: CANCELLATION_ACTIVE, alerte: true, remplacee_par: null };
  }
  const covering = active.filter((row) => sameHotel(row, cancellation) && nightsOverlap(row, cancellation) && isNewer(row, cancellation));
  const samePerson = covering.filter((row) => peopleShare(row.people, cancellation.people));
  if (samePerson.length) {
    return { suivi: CANCELLATION_REPLACED, alerte: false, remplacee_par: preferredReplacement(samePerson) };
  }
  if (covering.length && cancellation.people.length === 0) {
    return { suivi: CANCELLATION_HISTORICAL, alerte: false, remplacee_par: preferredReplacement(covering) };
  }
  return QUIET;
}

export function combineCancellationVerdicts(rows: CancellationVerdict[]): CancellationVerdict {
  const alert = rows.find((row) => row.alerte);
  if (alert) return alert;
  const replaced = rows.find((row) => row.suivi === CANCELLATION_REPLACED);
  if (replaced) return replaced;
  const historical = rows.find((row) => row.suivi === CANCELLATION_HISTORICAL);
  if (historical) return historical;
  return QUIET;
}

export function leStayAnchor(input: {
  confirmation: string | null;
  hotel: string | null;
  hotelId?: number | null;
  people?: string[] | null;
  checkIn?: string | null;
  checkOut?: string | null;
  state?: string | null;
  leId?: number | null;
  at?: string | null;
}): StayAnchor {
  return {
    confirmation: input.confirmation,
    hotel: input.hotel,
    hotelId: input.hotelId ?? null,
    people: personLines(input.people || []),
    checkIn: day(input.checkIn),
    checkOut: day(input.checkOut),
    active: !isLeCancelled(input.state),
    leId: input.leId ?? null,
    at: input.at || null,
  };
}

type CardRow = {
  booking_id?: string | null;
  confirmation_ref?: string | null;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  lifecycle?: string | null;
  created_at?: string | null;
  details?: Record<string, unknown> | null;
};

function detailText(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value : "";
}

function cardConfirmation(row: CardRow) {
  const refs = [row.confirmation_ref];
  const rooms = Array.isArray(row.details?.rooms) ? row.details.rooms : [];
  for (const room of rooms) {
    if (room && typeof room === "object") refs.push((room as { confirmation_ref?: string | null }).confirmation_ref);
  }
  return refs.filter((ref) => (ref || "").trim()).join(";");
}

function cardAnchor(
  row: CardRow,
  people: string[],
  leByConfirmation: StayAnchor[]
): StayAnchor | null {
  if (!isActiveItem(row)) return null;
  const confirmation = cardConfirmation(row) || null;
  const linked = leByConfirmation.find(
    (stay) => stay.active && confirmation && confirmationRefsAlign(stay.confirmation, confirmation)
  );
  const names = personLines(people, detailText(row.details, "guests").split(","));
  return {
    confirmation,
    hotel: detailText(row.details, "hotel_name") || row.title || null,
    hotelId: hotelIdOf(row.details?.le_hotel_id) ?? linked?.hotelId ?? null,
    people: personLines(names, linked?.people || []),
    checkIn: day(row.start_at),
    checkOut: day(row.end_at),
    active: true,
    leId: linked?.leId ?? null,
    at: row.created_at || null,
  };
}

type LeRow = {
  confirmation_number?: string | null;
  state?: string | null;
  hotel_name?: string | null;
  hotel_id?: number | null;
  check_in?: string | null;
  check_out?: string | null;
  guest_names?: string[] | null;
  le_booking_id?: number | null;
};

type TravelerRow = { booking_id?: string | null; first_name?: string | null; last_name?: string | null };
type CustomerRow = { id?: string | null; first_name?: string | null; last_name?: string | null };
type BookingRow = { id?: string | null; customer_id?: string | null };

function travelerNames(row: TravelerRow) {
  const first = (row.first_name || "").trim();
  const last = (row.last_name || "").trim();
  return personLines([`${first} ${last}`, `${last} ${first}`]);
}

/** Cartes actives et séjours Little Emperors déjà en base. */
export async function loadStayAnchors(admin: SupabaseClient): Promise<StayAnchor[]> {
  const [cards, stays] = await Promise.all([
    admin
      .from("crm_booking_items")
      .select("booking_id, confirmation_ref, title, start_at, end_at, lifecycle, created_at, details")
      .eq("kind", "hotel")
      .limit(400),
    admin
      .from("crm_le_bookings")
      .select("confirmation_number, state, hotel_name, hotel_id, check_in, check_out, guest_names, le_booking_id")
      .limit(400),
  ]);
  if (cards.error) {
    console.error("[annulation] cartes", cards.error.code ?? "?");
    throw new Error("Lecture impossible.");
  }
  if (stays.error) {
    console.error("[annulation] little-emperors", stays.error.code ?? "?");
    throw new Error("Lecture impossible.");
  }
  const leAnchors = ((stays.data || []) as LeRow[]).map((row) =>
    leStayAnchor({
      confirmation: row.confirmation_number || null,
      hotel: row.hotel_name || null,
      hotelId: row.hotel_id ?? null,
      people: row.guest_names || [],
      checkIn: row.check_in,
      checkOut: row.check_out,
      state: row.state,
      leId: row.le_booking_id ?? null,
    })
  );
  const items = (cards.data || []) as CardRow[];
  const bookingIds = [...new Set(items.map((row) => row.booking_id).filter((id): id is string => Boolean(id)))];
  const bookings = bookingIds.length
    ? await admin.from("crm_bookings").select("id, customer_id").in("id", bookingIds)
    : { data: [], error: null };
  if (bookings.error) {
    console.error("[annulation] dossiers", bookings.error.code ?? "?");
    throw new Error("Lecture impossible.");
  }
  const bookingRows = (bookings.data || []) as BookingRow[];
  const customerIds = [...new Set(bookingRows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
  const [travelers, customers] = await Promise.all([
    bookingIds.length
      ? admin.from("crm_booking_travelers").select("booking_id, first_name, last_name").in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? admin.from("crm_customers").select("id, first_name, last_name").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (travelers.error) {
    console.error("[annulation] voyageurs", travelers.error.code ?? "?");
    throw new Error("Lecture impossible.");
  }
  if (customers.error) {
    console.error("[annulation] clients", customers.error.code ?? "?");
    throw new Error("Lecture impossible.");
  }
  const peopleByBooking = new Map<string, string[]>();
  for (const row of (travelers.data || []) as TravelerRow[]) {
    if (!row.booking_id) continue;
    const list = peopleByBooking.get(row.booking_id) || [];
    list.push(...travelerNames(row));
    peopleByBooking.set(row.booking_id, list);
  }
  const customerById = new Map(
    ((customers.data || []) as CustomerRow[]).map((row) => [row.id, `${row.first_name || ""} ${row.last_name || ""}`.trim()])
  );
  const customerByBooking = new Map(
    bookingRows.map((row) => [row.id, row.customer_id ? customerById.get(row.customer_id) || "" : ""])
  );
  const cardAnchors = items.flatMap((row) => {
    const people = personLines(peopleByBooking.get(row.booking_id || "") || [], [
      customerByBooking.get(row.booking_id || "") || "",
    ]);
    const anchor = cardAnchor(row, people, leAnchors);
    return anchor ? [anchor] : [];
  });
  return [...leAnchors, ...cardAnchors];
}

function extractPeople(extract: BookingExtract) {
  const lines: string[] = [];
  const customer = `${extract.customer_first_name || ""} ${extract.customer_last_name || ""}`.trim();
  if (customer) lines.push(customer);
  for (const row of extract.travelers || []) {
    lines.push(`${row.first_name || ""} ${row.last_name || ""}`);
    lines.push(`${row.last_name || ""} ${row.first_name || ""}`);
  }
  return personLines(lines);
}

function hotelItems(extract: BookingExtract) {
  return (extract.items || []).filter((item) => (item.kind || "") === "hotel");
}

function leIdForConfirmation(confirmation: string | null, known: StayAnchor[]) {
  const ids = known
    .filter((row) => row.leId != null && confirmation && confirmationRefsAlign(row.confirmation, confirmation))
    .map((row) => row.leId as number);
  if (!ids.length) return null;
  return Math.max(...ids);
}

export function extractCancellationVerdict(
  input: { label?: string | null; receivedAt?: string | null; extract: BookingExtract },
  known: StayAnchor[]
): CancellationVerdict {
  const labelled = isBookingCancellationLabel(input.label);
  const cancelled = labelled || isCancellationExtract(input.extract);
  if (!cancelled) return QUIET;
  const hotels = hotelItems(input.extract);
  const people = extractPeople(input.extract);
  const sources = hotels.length ? hotels : [null];
  return combineCancellationVerdicts(
    sources.map((item) => {
      const confirmation = item?.confirmation_ref || null;
      return supplierCancellationVerdict(
        {
          confirmation,
          hotel: (typeof item?.details?.hotel_name === "string" && item.details.hotel_name) || item?.title || null,
          hotelId: hotelIdOf(item?.details?.le_hotel_id),
          people: personLines(people, typeof item?.details?.guests === "string" ? item.details.guests.split(",") : []),
          checkIn: day(item?.start_at) || day(input.extract.start_date),
          checkOut: day(item?.end_at) || day(input.extract.end_date),
          active: false,
          leId: leIdForConfirmation(confirmation, known),
          at: input.receivedAt || null,
        },
        known
      );
    })
  );
}

export function leCancellationVerdict(
  row: {
    confirmation_number?: string | null;
    state?: string | null;
    hotel_name?: string | null;
    hotel_id?: number | null;
    check_in?: string | null;
    check_out?: string | null;
    guest_names?: string[] | null;
    le_booking_id?: number | null;
  },
  known: StayAnchor[]
): CancellationVerdict {
  if (!isLeCancelled(row.state)) return QUIET;
  return supplierCancellationVerdict(
    leStayAnchor({
      confirmation: row.confirmation_number || null,
      hotel: row.hotel_name || null,
      hotelId: row.hotel_id ?? null,
      people: row.guest_names || [],
      checkIn: row.check_in,
      checkOut: row.check_out,
      state: row.state,
      leId: row.le_booking_id ?? null,
    }),
    known
  );
}

export function parseStoredExtract(raw: unknown) {
  return parseExtractPayloadSafe(raw);
}

export function cancellationStatut(raw: string | null, verdict: CancellationVerdict) {
  if (verdict.suivi === CANCELLATION_REPLACED) return "Remplacée";
  if (verdict.suivi === CANCELLATION_HISTORICAL) return "Historique";
  if (verdict.suivi === CANCELLATION_ACTIVE) return "Annulée";
  return raw;
}
