import type { CrmBookingTraveler, CrmTravelDocument } from "./types";
import { isPlaceholderTraveler, type PersonName } from "./person-match";
import {
  reusableDocumentsForTraveler,
  travelerDisplayName,
  tripDocumentsForTraveler,
} from "./trip-documents";

export type PassportVaultTone = "ok" | "soon" | "missing" | "alert";

export type PassportTripDates = {
  start_date?: string | null;
  end_date?: string | null;
};

export type PassportVaultRow = {
  travelerId: string;
  name: string;
  tone: PassportVaultTone;
  label: string;
};

const SOON_DAYS = 180;

function plusDays(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoDay(value: string | null | undefined) {
  const day = (value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function addMonths(iso: string, months: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  cursor.setUTCDate(Math.min(day, last));
  return cursor.toISOString().slice(0, 10);
}

function tripReturn(trip?: PassportTripDates | null) {
  if (!trip) return "";
  return isoDay(trip.end_date) || isoDay(trip.start_date);
}

export function passportVaultToneClass(tone: PassportVaultTone) {
  if (tone === "ok") return "bg-[#0B192C] text-[#C5A880]";
  if (tone === "soon") return "bg-[#C5A880]/25 text-[#0B192C]";
  if (tone === "alert") return "bg-red-50 text-[var(--admin-red)]";
  return "bg-[#f3e6e2] text-[#0B192C]";
}

function againstTrip(expires: string, returnOn: string): { tone: PassportVaultTone; label: string } {
  if (expires <= returnOn) return { tone: "alert", label: "Expire avant le voyage" };
  if (expires < addMonths(returnOn, 6)) {
    return { tone: "soon", label: "Moins de 6 mois après le retour" };
  }
  return { tone: "ok", label: "Passeport à jour" };
}

function passportFor(
  traveler: CrmBookingTraveler,
  docs: CrmTravelDocument[],
  holder?: PersonName | null
) {
  const pool = [
    ...tripDocumentsForTraveler(docs, traveler),
    ...reusableDocumentsForTraveler(docs, traveler, holder),
  ].filter((doc) => doc.doc_type === "passport");
  return (
    pool.sort((a, b) => (b.expires_on || "").localeCompare(a.expires_on || ""))[0] || null
  );
}

export function passportVaultRows(
  travelers: CrmBookingTraveler[],
  docs: CrmTravelDocument[],
  today: string,
  holder?: PersonName | null,
  trip?: PassportTripDates | null
): PassportVaultRow[] {
  const soonOn = plusDays(today, SOON_DAYS);
  const returnOn = tripReturn(trip);
  const rows: PassportVaultRow[] = [];
  for (const traveler of travelers) {
    if (isPlaceholderTraveler(traveler.first_name, traveler.last_name)) continue;
    const name = travelerDisplayName(traveler);
    if (!name || name === "Voyageur") continue;
    const passport = passportFor(traveler, docs, holder);
    if (!passport) {
      rows.push({ travelerId: traveler.id, name, tone: "missing", label: "Passeport manquant" });
      continue;
    }
    const expires = isoDay(passport.expires_on);
    if (returnOn && expires) {
      rows.push({ travelerId: traveler.id, name, ...againstTrip(expires, returnOn) });
      continue;
    }
    if (expires && expires < today) {
      rows.push({ travelerId: traveler.id, name, tone: "soon", label: "Expiré" });
      continue;
    }
    if (expires && expires <= soonOn) {
      rows.push({ travelerId: traveler.id, name, tone: "soon", label: "Expire bientôt" });
      continue;
    }
    rows.push({ travelerId: traveler.id, name, tone: "ok", label: "Passeport à jour" });
  }
  return rows;
}
