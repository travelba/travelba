import { isPlaceholderTraveler, type PersonName } from "./person-match";
import { documentMatchesTraveler, travelerDisplayName } from "./trip-documents";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

export type PrecheckPiece = {
  id: string;
  label: "Passeport" | "Carte d'identité";
  path: string;
  fileName: string;
};

export type PrecheckTraveler = {
  id: string;
  name: string;
  pieces: PrecheckPiece[];
};

const IDENTITY = [
  ["passport", "Passeport"],
  ["id_card", "Carte d'identité"],
] as const;

/** Une pièce d'identité par voyageur et par type, celle du séjour en priorité. */
export function precheckParty(
  travelers: CrmBookingTraveler[],
  docs: CrmTravelDocument[],
  holder?: PersonName | null
): PrecheckTraveler[] {
  const named = travelers.filter((traveler) => !isPlaceholderTraveler(traveler.first_name, traveler.last_name));
  const party = named.length ? named : travelers;
  const seen = new Set<string>();
  return party.map((traveler) => {
    const pieces: PrecheckPiece[] = [];
    for (const [type, label] of IDENTITY) {
      const matches = docs.filter(
        (doc) => doc.doc_type === type && Boolean(doc.storage_path) && documentMatchesTraveler(doc, traveler, holder)
      );
      const doc = matches.find((row) => row.booking_id === traveler.booking_id) || matches[0] || null;
      if (!doc?.storage_path || seen.has(doc.id)) continue;
      seen.add(doc.id);
      pieces.push({
        id: doc.id,
        label,
        path: doc.storage_path,
        fileName: doc.file_name || label,
      });
    }
    return { id: traveler.id, name: travelerDisplayName(traveler), pieces };
  });
}

export function selectedPrecheckPieces(party: PrecheckTraveler[], ids: string[]) {
  const wanted = new Set(ids);
  return party.flatMap((traveler) => traveler.pieces.filter((piece) => wanted.has(piece.id)).map((piece) => ({ ...piece, traveler: traveler.name })));
}
