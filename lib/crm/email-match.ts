import type { BookingExtract } from "@/lib/crm/ingest-types";
import type {
  CrmBooking,
  CrmBookingItem,
  CrmCustomer,
  EmailIngestCandidate,
} from "@/lib/crm/types";
import { customerFullName } from "@/lib/crm/types";
import { normalizeMatchText } from "@/lib/crm/revolut-match";

type CustomerLite = Pick<
  CrmCustomer,
  "id" | "first_name" | "last_name" | "company_name" | "email"
>;

function customerLabel(c: CustomerLite) {
  const name = customerFullName(c);
  const company = c.company_name?.trim();
  return company ? `${name} · ${company}` : name;
}

/** Découpe une référence composite (« 976;977 », « A / B ») en jetons normalisés. */
export function referenceTokens(value: string | null | undefined): string[] {
  return String(value || "")
    .split(/[\s;,/|]+/)
    .map((token) => normalizeMatchText(token))
    .filter((token) => token.length >= 4);
}

/** Toutes les références présentes dans un extract (items + réf. dossier). */
export function extractReferences(extract: BookingExtract): Set<string> {
  const out = new Set<string>();
  for (const item of extract.items || []) {
    for (const token of referenceTokens(item.confirmation_ref)) out.add(token);
    const rooms = Array.isArray(item.details?.rooms) ? item.details!.rooms : [];
    for (const room of rooms) {
      for (const token of referenceTokens(room?.confirmation_ref)) out.add(token);
    }
  }
  return out;
}

export type CustomerSuggestion = {
  autoCustomerId: string | null;
  candidates: EmailIngestCandidate[];
};

/**
 * Client suggéré à partir de l'extract : e-mail exact d'abord, puis nom.
 * autoCustomerId n'est renseigné que sur un hit fort et unique.
 */
export function suggestCustomerFromExtract(
  customers: CustomerLite[],
  extract: BookingExtract
): CustomerSuggestion {
  const byId = new Map<string, EmailIngestCandidate>();
  const push = (c: CustomerLite, score: number, reason: string) => {
    const prev = byId.get(c.id);
    if (prev && prev.score >= score) return;
    byId.set(c.id, {
      customer_id: c.id,
      booking_id: null,
      label: customerLabel(c),
      reason,
      score,
    });
  };

  const email = (extract.customer_email || "").trim().toLowerCase();
  let emailHit: string | null = null;
  if (email) {
    const hit = customers.find((c) => (c.email || "").toLowerCase() === email);
    if (hit) {
      push(hit, 100, "E-mail du client");
      emailHit = hit.id;
    }
  }

  const last = normalizeMatchText(extract.customer_last_name);
  const first = normalizeMatchText(extract.customer_first_name);
  const lastCounts = new Map<string, number>();
  for (const c of customers) {
    const l = normalizeMatchText(c.last_name);
    if (l) lastCounts.set(l, (lastCounts.get(l) || 0) + 1);
  }

  const nameHits: string[] = [];
  if (last.length >= 2) {
    for (const c of customers) {
      if (normalizeMatchText(c.last_name) !== last) continue;
      const cf = normalizeMatchText(c.first_name);
      const firstOk =
        !first || cf === first || cf.startsWith(first) || first.startsWith(cf);
      if (!firstOk) continue;
      const uniqueLast = (lastCounts.get(last) || 0) === 1;
      const score = first ? (uniqueLast ? 92 : 85) : uniqueLast ? 88 : 60;
      push(c, score, first ? "Nom et prénom" : "Nom de famille");
      nameHits.push(c.id);
    }
  }

  let autoCustomerId: string | null = emailHit;
  if (!autoCustomerId) {
    const strong = nameHits.filter((id) => (byId.get(id)?.score || 0) >= 85);
    if (strong.length === 1) autoCustomerId = strong[0];
  }

  const candidates = [...byId.values()].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr")
  );
  return { autoCustomerId, candidates };
}

export type BookingSuggestion = {
  autoBookingId: string | null;
  candidates: { booking_id: string; label: string; reason: string; score: number }[];
};

function bookingLabel(b: Pick<CrmBooking, "reference" | "title" | "destination">) {
  const title = (b.title || b.destination || "").trim();
  return title ? `${b.reference} — ${title}` : b.reference;
}

/**
 * Voyage existant suggéré par recouvrement de références (réf. dossier ou
 * confirmation_ref d'un item) avec les documents de l'e-mail.
 */
export function suggestBookingByReference(
  extract: BookingExtract,
  bookings: Pick<CrmBooking, "id" | "reference" | "title" | "destination">[],
  itemsByBooking: Map<string, Pick<CrmBookingItem, "confirmation_ref">[]>
): BookingSuggestion {
  const refs = extractReferences(extract);
  const candidates: BookingSuggestion["candidates"] = [];
  if (refs.size) {
    for (const booking of bookings) {
      const bookingRef = normalizeMatchText(booking.reference);
      let score = 0;
      let reason = "";
      if (bookingRef && refs.has(bookingRef)) {
        score = 100;
        reason = "Référence dossier";
      } else {
        const items = itemsByBooking.get(booking.id) || [];
        const hit = items.some((item) =>
          referenceTokens(item.confirmation_ref).some((token) => refs.has(token))
        );
        if (hit) {
          score = 90;
          reason = "Référence fournisseur";
        }
      }
      if (score > 0) {
        candidates.push({
          booking_id: booking.id,
          label: bookingLabel(booking),
          reason,
          score,
        });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr"));
  const strong = candidates.filter((c) => c.score >= 90);
  const autoBookingId = strong.length === 1 ? strong[0].booking_id : null;
  return { autoBookingId, candidates };
}
