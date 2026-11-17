import {
  decideFlightAutoAttach,
  dossierSpansTooLong,
  extractHasPlaceholderRef,
  flightsDatedBeforeMail,
  hasUsableFlight,
  hotelDatedBeforeMail,
  type FlightAutoCandidate,
  type FlightAutoDecision,
} from "@/lib/crm/email-flight-deposit";
import { clientIsMailTraveler, stayDatesCompatible } from "@/lib/crm/email-match";
import { isCancellationExtract, type BookingExtract } from "@/lib/crm/ingest-types";

type StayExtract = BookingExtract;

export function hasUsableHotel(extract: StayExtract | null | undefined) {
  return (extract?.items || []).some((item) => {
    if ((item.kind || "") !== "hotel") return false;
    if (!(item.title || "").trim()) return false;
    return Boolean((item.start_at || "").trim() || (item.end_at || "").trim());
  });
}

export function isCancelledLittleEmperors(extract: StayExtract | null | undefined) {
  return (extract?.items || []).some((item) => {
    const details = (item.details || {}) as Record<string, unknown>;
    const family = String(details.source_family || "");
    if (family !== "little_emperors") return false;
    const state = `${details.state || ""} ${details.status || ""}`;
    return /annul|cancel|fail|échec|echec/i.test(state) || isCancellationExtract(extract || { document_status: null, title: "", notes_client: "" });
  });
}

function blockedStay(extract: StayExtract | null | undefined, receivedAt?: string | null) {
  if (!extract) return true;
  if (extract.document_status === "quote" || extract.document_status === "identity") return true;
  if (isCancellationExtract(extract) || isCancelledLittleEmperors(extract)) return true;
  if (extractHasPlaceholderRef(extract)) return true;
  if (flightsDatedBeforeMail(extract, receivedAt) || hotelDatedBeforeMail(extract, receivedAt)) return true;
  return !hasUsableFlight(extract) && !hasUsableHotel(extract);
}

/** Rattache un vol ou un hôtel à un dossier déjà là. */
export function decideStayAutoAttach(
  extract: StayExtract | null | undefined,
  candidates: FlightAutoCandidate[] | null | undefined,
  context?: { receivedAt?: string | null }
): FlightAutoDecision | null {
  if (!extract || blockedStay(extract, context?.receivedAt)) return null;
  const flightDecision = hasUsableFlight(extract)
    ? decideFlightAutoAttach(extract, candidates, context)
    : decideFlightAutoAttach({ ...extract, items: flightStandIn(extract) }, candidates, context);
  if (flightDecision) return flightDecision;
  return decideKnownClientStay(extract, candidates);
}

/**
 * Un seul dossier du client connu (titulaire ou accompagnant), aux dates
 * compatibles : le mail y est rangé. Deux dossiers, un séjour annulé ou un
 * dossier trop long : rien, la file garde la proposition.
 */
function decideKnownClientStay(
  extract: StayExtract,
  candidates: FlightAutoCandidate[] | null | undefined
): FlightAutoDecision | null {
  const customerId = knownClientId(candidates || []);
  if (!customerId) return null;
  const rows = compatibleClientStays(extract, candidates || [], customerId);
  if (rows.length !== 1) return null;
  const hit = rows[0];
  if (!hit?.booking_id) return null;
  return { bookingId: hit.booking_id, customerId, reason: hit.reason || "Dates compatibles" };
}

function compatibleClientStays(extract: StayExtract, candidates: FlightAutoCandidate[], customerId: string) {
  const seen = new Set<string>();
  const rows: FlightAutoCandidate[] = [];
  for (const row of candidates) {
    if (!row.booking_id || row.customer_id !== customerId) continue;
    if (/annul/i.test(row.reason || "")) continue;
    if (dossierSpansTooLong(row.start_date, row.end_date)) continue;
    if (!compatibleOpenDossier(row, extract)) continue;
    if (seen.has(row.booking_id)) continue;
    seen.add(row.booking_id);
    rows.push(row);
  }
  return rows;
}

function flightStandIn(extract: StayExtract | null | undefined): StayExtract["items"] {
  const hotel = (extract?.items || []).find((item) => (item.kind || "") === "hotel");
  if (!hotel) return extract?.items || [];
  return [
    {
      ...hotel,
      kind: "flight",
      details: {
        ...(hotel.details || {}),
        flight_number: "STAY",
        pnr: hotel.confirmation_ref || hotel.details?.pnr,
      },
    },
    ...(extract?.items || []).filter((item) => item !== hotel),
  ];
}

function knownClientId(candidates: FlightAutoCandidate[]) {
  const rows = candidates.filter((row) => {
    if (!row.customer_id || row.booking_id) return false;
    const reason = row.reason || "";
    const score = row.score || 0;
    if (score >= 100 && /e-mail du client/i.test(reason)) return true;
    return score >= 92 && /nom et prénom|prénom et nom invers|accompagnant de/i.test(reason);
  });
  const ids = [...new Set(rows.map((row) => row.customer_id as string))];
  return ids.length === 1 ? ids[0] : null;
}

const DATE_BOUND_REASON =
  /voyageur et dates|même séjour|ajouter au dossier|nom, destination et dates|hôtel, dates/i;

/** Référence, PNR, ou dates qui se croisent ou sont proches. La même ville seule ne compte pas. */
function compatibleOpenDossier(row: FlightAutoCandidate, extract: StayExtract) {
  const reason = row.reason || "";
  if (/référence/i.test(reason)) return true;
  if (row.start_date || row.end_date) return stayDatesCompatible(extract, row.start_date, row.end_date);
  return DATE_BOUND_REASON.test(reason);
}

/**
 * Un seul client connu, aucun dossier compatible : ouvrir un séjour caché.
 * Compatible : référence, PNR, ou dates qui se croisent ou sont proches.
 * Un client inconnu, un homonyme, ou plusieurs fiches identiques : rien.
 */
export function decideStayAutoCreate(
  extract: StayExtract | null | undefined,
  candidates: FlightAutoCandidate[] | null | undefined,
  context?: { receivedAt?: string | null; customer?: { first_name?: string | null; last_name?: string | null; usage_name?: string | null; email?: string | null } | null }
): { customerId: string } | null {
  if (!extract || blockedStay(extract, context?.receivedAt)) return null;
  if (decideStayAutoAttach(extract, candidates, context)) return null;
  const rows = candidates || [];
  if (rows.some((row) => row.booking_id && (row.score || 0) >= 88)) return null;
  const customerId = knownClientId(rows);
  if (!customerId) return null;
  if (context?.customer && !clientIsMailTraveler(context.customer, extract)) return null;
  if (
    rows.some(
      (row) => row.booking_id && row.customer_id === customerId && compatibleOpenDossier(row, extract)
    )
  ) {
    return null;
  }
  return { customerId };
}
