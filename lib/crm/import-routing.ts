import type { BookingExtract } from "@/lib/crm/ingest-types";

export type ImportTaskKind = "checkin" | "visa" | "preregistration";

export type ImportTask = { kind: ImportTaskKind; title: string };

const TICKETING_FEE = /frais de billeterie|ticketing fee|service fee|frais d['’]émission/i;
const PREREG = /pr[eé].?enregistrement|pre-?registration|online check-?in|enregistrement en ligne/i;

function taskOf(item: { kind?: string | null; title?: string | null }): ImportTask | null {
  const title = (item.title || "").trim();
  if (item.kind === "visa") return { kind: "visa", title: title || "Visa" };
  if (item.kind === "checkin") return { kind: "checkin", title: title || "Enregistrement" };
  if (PREREG.test(title)) return { kind: "preregistration", title: title || "Pré-enregistrement" };
  return null;
}

function isTicketingFee(item: { kind?: string | null; title?: string | null }) {
  return item.kind === "fee" || TICKETING_FEE.test(item.title || "");
}

/**
 * Le mail remplit une carte, puis vit avec les pièces.
 * Les frais de billeterie ne deviennent pas une étape : ils restent dans le prix.
 * Enregistrement, pré-enregistrement et visa vont dans À faire.
 */
export function routeMailExtract(extract: BookingExtract): { extract: BookingExtract; tasks: ImportTask[] } {
  const tasks: ImportTask[] = [];
  const items = [];
  for (const item of extract.items || []) {
    if (isTicketingFee(item)) continue;
    const task = taskOf(item);
    if (task) {
      tasks.push(task);
      continue;
    }
    items.push(item);
  }
  return { extract: { ...extract, notes_client: null, items }, tasks };
}
