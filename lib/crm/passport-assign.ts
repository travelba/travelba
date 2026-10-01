import type { ExtractedIdentity } from "./identity";
import {
  foldName,
  matchTravelerToParty,
  nameTokens,
  namesReferToSamePerson,
  type PartyMatch,
  type PersonName,
} from "./person-match";
import { samePassportPerson } from "./passport-extract";

export type PassportTarget = PartyMatch | { kind: "create"; personKey?: string };

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

function createPersonKey(identity: ExtractedIdentity) {
  const last = foldName(identity.last_name);
  const first = nameTokens(identity.first_name).join(" ");
  const birth = identity.birth_date || "";
  if (last && first) return `p:${last}|${first}|${birth}`;
  return `n:${identity.number || ""}`;
}

/**
 * Rattache chaque passeport lu à une personne du foyer.
 * Match unique par nom. Deux livrets de la même personne (nom + date de naissance)
 * restent sur cette personne : on ne crée pas un second accompagnateur.
 * Un fichier à plusieurs personnes crée un accompagnateur par inconnu —
 * on ne déverse pas le premier sur le titulaire.
 * `prefer` ne reçoit un inconnu que s’il n’y a qu’une personne, ou depuis la fiche d’un compagnon.
 */
export function assignPassportsToParty(
  identities: ExtractedIdentity[],
  holder: PersonName,
  companions: (PersonName & { id: string })[],
  prefer: PartyMatch | null = null
): PassportAssignment[] {
  const groups: ExtractedIdentity[][] = [];
  for (const identity of identities) {
    const group = groups.find((members) => members.some((member) => samePassportPerson(member, identity)));
    if (group) group.push(identity);
    else groups.push([identity]);
  }

  const taken = new Set<string>();
  const personKey = (match: PartyMatch) => (match.kind === "holder" ? "holder" : match.id);
  const repAssignments: PassportAssignment[] = [];
  const leftover: ExtractedIdentity[] = [];

  for (const group of groups) {
    const identity = group[0];
    const match = matchTravelerToParty(identity, holder, companions);
    if (match && !taken.has(personKey(match))) {
      taken.add(personKey(match));
      repAssignments.push({ identity, target: match });
    } else {
      leftover.push(identity);
    }
  }

  const fillPreferWithStranger =
    prefer &&
    leftover.length > 0 &&
    !taken.has(personKey(prefer)) &&
    (prefer.kind === "companion" || groups.length === 1);

  if (prefer && fillPreferWithStranger) {
    const identity = leftover.shift();
    if (identity) {
      taken.add(personKey(prefer));
      repAssignments.push({ identity, target: prefer });
    }
  }

  for (const identity of leftover) {
    repAssignments.push({ identity, target: { kind: "create", personKey: createPersonKey(identity) } });
  }

  const expanded: PassportAssignment[] = [];
  for (const assignment of repAssignments) {
    const group = groups.find((members) => members[0] === assignment.identity) || [assignment.identity];
    const target =
      assignment.target.kind === "create"
        ? { kind: "create" as const, personKey: assignment.target.personKey || createPersonKey(assignment.identity) }
        : assignment.target;
    for (const identity of group) expanded.push({ identity, target });
  }
  return expanded;
}
