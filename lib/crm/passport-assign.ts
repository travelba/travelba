import type { ExtractedIdentity } from "./identity";
import {
  matchTravelerToParty,
  namesReferToSamePerson,
  type PartyMatch,
  type PersonName,
} from "./person-match";

export type PassportTarget = PartyMatch | { kind: "create" };

export type PassportAssignment = {
  identity: ExtractedIdentity;
  target: PassportTarget;
};

export function identityForPerson(
  identities: ExtractedIdentity[],
  person?: PersonName | null
): ExtractedIdentity | null {
  if (!identities.length) return null;
  if (person && (person.first_name || person.last_name)) {
    const hit = identities.find((identity) => namesReferToSamePerson(identity, person));
    if (hit) return hit;
    if (identities.length > 1) return null;
  }
  if (identities.length > 1) return null;
  return identities[0];
}

/**
 * Rattache chaque passeport lu à une personne du foyer.
 * Match unique par nom. Un fichier à plusieurs passeports crée un accompagnateur
 * par personne inconnue — on ne déverse pas le premier sur le titulaire.
 * `prefer` ne reçoit un inconnu que s’il n’y a qu’une pièce, ou depuis la fiche d’un compagnon.
 */
export function assignPassportsToParty(
  identities: ExtractedIdentity[],
  holder: PersonName,
  companions: (PersonName & { id: string })[],
  prefer: PartyMatch | null = null
): PassportAssignment[] {
  const taken = new Set<string>();
  const personKey = (match: PartyMatch) => (match.kind === "holder" ? "holder" : match.id);
  const assignments: PassportAssignment[] = [];
  const leftover: ExtractedIdentity[] = [];

  for (const identity of identities) {
    const match = matchTravelerToParty(identity, holder, companions);
    if (match && !taken.has(personKey(match))) {
      taken.add(personKey(match));
      assignments.push({ identity, target: match });
    } else {
      leftover.push(identity);
    }
  }

  const fillPreferWithStranger =
    prefer &&
    leftover.length > 0 &&
    !taken.has(personKey(prefer)) &&
    (prefer.kind === "companion" || identities.length === 1);

  if (prefer && fillPreferWithStranger) {
    const identity = leftover.shift();
    if (identity) {
      taken.add(personKey(prefer));
      assignments.push({ identity, target: prefer });
    }
  }

  for (const identity of leftover) {
    assignments.push({ identity, target: { kind: "create" } });
  }
  return assignments;
}
