import { customerFullName, type CrmCustomer } from "./types";

export type PickableCustomer = Pick<
  CrmCustomer,
  "id" | "first_name" | "last_name" | "company_name" | "email" | "phone"
>;

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function nationalPhoneDigits(value: string) {
  let d = digits(value);
  if (d.startsWith("33") && d.length >= 11) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return d;
}

export function customerPickLabel(c: PickableCustomer) {
  const name = customerFullName(c);
  const company = c.company_name?.trim();
  return company ? `${name} · ${company}` : name;
}

export function customerMatchesQuery(c: PickableCustomer, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const needle = fold(trimmed);
  const hay = fold(
    `${customerFullName(c)} ${c.company_name || ""} ${c.email || ""} ${c.phone || ""}`
  );
  if (hay.includes(needle)) return true;
  const phoneNeedle = digits(trimmed);
  if (phoneNeedle.length >= 4) {
    const stored = digits(c.phone || "");
    const national = nationalPhoneDigits(c.phone || "");
    return (
      stored.includes(phoneNeedle) ||
      national.includes(nationalPhoneDigits(trimmed)) ||
      national.includes(phoneNeedle.replace(/^0/, ""))
    );
  }
  return false;
}

/** Propositions d’abord, puis le reste filtré par nom / société / e-mail / téléphone. */
export function filterCustomersForPick(
  customers: PickableCustomer[],
  query: string,
  suggestedIds: string[] = []
): { suggested: PickableCustomer[]; rest: PickableCustomer[] } {
  const filtered = customers.filter((c) => customerMatchesQuery(c, query));
  const byId = new Map(filtered.map((c) => [c.id, c]));
  const suggested: PickableCustomer[] = [];
  const seen = new Set<string>();
  for (const id of suggestedIds) {
    const hit = byId.get(id);
    if (hit) {
      suggested.push(hit);
      seen.add(hit.id);
    }
  }
  return { suggested, rest: filtered.filter((c) => !seen.has(c.id)) };
}
