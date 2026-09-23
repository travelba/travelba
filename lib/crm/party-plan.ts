import type { CrmBookingTraveler, CrmTravelDocument } from "./types";
import {
  isPlaceholderTraveler,
  matchTravelerToParty,
  type PersonName,
} from "./person-match";
import {
  primaryIdentityDoc,
  reusableDocumentsForTraveler,
  tripDocumentsForTraveler,
} from "./trip-documents";

const IDENTITY_TYPES = new Set(["passport", "id_card"]);

export type TravelerLinkPlan = {
  id: string;
  action: "delete" | "link" | "keep";
  is_account_holder?: boolean;
  companion_id?: string | null;
};

export function planPartyLinks(
  travelers: CrmBookingTraveler[],
  holder: PersonName,
  companions: (PersonName & { id: string })[]
): TravelerLinkPlan[] {
  const hasNamed = travelers.some(
    (traveler) => !isPlaceholderTraveler(traveler.first_name, traveler.last_name)
  );
  return travelers.map((traveler) => {
    if (hasNamed && isPlaceholderTraveler(traveler.first_name, traveler.last_name)) {
      return { id: traveler.id, action: "delete" };
    }
    const match = matchTravelerToParty(traveler, holder, companions);
    if (!match) return { id: traveler.id, action: "keep" };
    const next =
      match.kind === "holder"
        ? { is_account_holder: true, companion_id: null }
        : { is_account_holder: false, companion_id: match.id };
    if (
      traveler.is_account_holder === next.is_account_holder &&
      traveler.companion_id === next.companion_id
    ) {
      return { id: traveler.id, action: "keep" };
    }
    return { id: traveler.id, action: "link", ...next };
  });
}

export function planPassportAttach(
  traveler: CrmBookingTraveler,
  docs: CrmTravelDocument[],
  validOn: string,
  holder?: PersonName | null
) {
  if (isPlaceholderTraveler(traveler.first_name, traveler.last_name)) return null;
  if (primaryIdentityDoc(tripDocumentsForTraveler(docs, traveler))) return null;
  const choices = reusableDocumentsForTraveler(docs, traveler, holder).filter((doc) =>
    IDENTITY_TYPES.has(doc.doc_type)
  );
  const valid = choices.filter((doc) => !doc.expires_on || doc.expires_on >= validOn);
  const passports = valid.filter((doc) => doc.doc_type === "passport");
  const pool = passports.length ? passports : valid;
  return pool.length === 1 ? pool[0] : null;
}
