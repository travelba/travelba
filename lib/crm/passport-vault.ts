import type { CrmBookingTraveler, CrmTravelDocument } from "./types";
import { isPlaceholderTraveler, type PersonName } from "./person-match";
import {
  reusableDocumentsForTraveler,
  travelerDisplayName,
  tripDocumentsForTraveler,
} from "./trip-documents";

export type PassportVaultTone = "ok" | "soon" | "missing";

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
  holder?: PersonName | null
): PassportVaultRow[] {
  const soonOn = plusDays(today, SOON_DAYS);
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
    const expires = passport.expires_on;
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
