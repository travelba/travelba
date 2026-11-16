import {
  decideFlightAutoAttach,
  extractHasPlaceholderRef,
  flightsDatedBeforeMail,
  hasUsableFlight,
  hotelDatedBeforeMail,
  type FlightAutoCandidate,
  type FlightAutoDecision,
} from "@/lib/crm/email-flight-deposit";
import { clientIsMailTraveler } from "@/lib/crm/email-match";
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
  if (blockedStay(extract, context?.receivedAt)) return null;
  if (hasUsableFlight(extract)) return decideFlightAutoAttach(extract, candidates, context);
  return decideFlightAutoAttach({ ...extract, items: flightStandIn(extract) }, candidates, context);
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
    return score >= 92 && /nom et prénom|prénom et nom invers/i.test(reason);
  });
  const ids = [...new Set(rows.map((row) => row.customer_id as string))];
  return ids.length === 1 ? ids[0] : null;
}

/**
 * Un seul client connu, aucun dossier du même voyage : ouvrir un séjour caché.
 * Un client inconnu ou un homonyme ne crée rien.
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
  if (rows.some((row) => row.booking_id && row.customer_id === customerId)) return null;
  return { customerId };
}
