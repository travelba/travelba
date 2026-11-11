import { isUuid } from "@/lib/crm/ids";
import { staffGivenName } from "@/lib/crm/staff-name";

/** Filtre « En charge » de la liste des dossiers. */
export type OwnerFilter =
  | { kind: "all" }
  | { kind: "mine" }
  | { kind: "none" }
  | { kind: "staff"; id: string };

/** `qui` de l’URL : moi, personne, ou l’identifiant d’un collègue. Le reste = tous. */
export function parseOwnerFilter(value: string | null | undefined): OwnerFilter {
  const raw = (value || "").trim();
  if (raw === "moi") return { kind: "mine" };
  if (raw === "personne") return { kind: "none" };
  if (isUuid(raw)) return { kind: "staff", id: raw };
  return { kind: "all" };
}

/** Valeur à remettre dans `?qui=`. Absent pour « tous ». */
export function ownerFilterParam(filter: OwnerFilter) {
  if (filter.kind === "mine") return "moi";
  if (filter.kind === "none") return "personne";
  if (filter.kind === "staff") return filter.id;
  return null;
}

export function bookingMatchesOwner(
  ownerId: string | null | undefined,
  filter: OwnerFilter,
  meId: string
) {
  if (filter.kind === "all") return true;
  if (filter.kind === "mine") return ownerId === meId;
  if (filter.kind === "none") return !ownerId;
  return ownerId === filter.id;
}

/** Le bouton « Me mettre en charge » : le rôle peut écrire, et ce n’est pas déjà soi. */
export function showTakeCharge(input: { canTake: boolean; mine: boolean }) {
  return input.canTake && !input.mine;
}

/** Deux Marie : le nom complet. Sinon le prénom. */
export function chargeOptionLabel(fullName: string, peers: readonly string[]) {
  const given = staffGivenName(fullName);
  if (!given) return fullName.trim();
  const collisions = peers.filter((name) => staffGivenName(name) === given).length;
  return collisions > 1 ? fullName.trim() : given;
}

export function chargeSelectOptions(people: readonly { id: string; name: string }[]) {
  const names = people.map((person) => person.name);
  return [
    { value: "", label: "En charge : Tous" },
    { value: "moi", label: "En charge : Moi" },
    { value: "personne", label: "En charge : Personne" },
    ...people.map((person) => ({
      value: person.id,
      label: `En charge : ${chargeOptionLabel(person.name, names)}`,
    })),
  ];
}
