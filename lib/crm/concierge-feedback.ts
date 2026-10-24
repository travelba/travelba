/** Retours d’agence sur une réponse du Concierge. Pas de numéro de pièce. */

export type ConciergeMark = "good" | "bad";

export type ConciergeMarkedMessage = {
  id: string;
  direction: "inbound" | "outbound" | string;
  body: string;
  created_at: string;
  concierge_mark: string | null;
  customer_id?: string | null;
};

export type ConciergeBadCase = {
  id: string;
  at: string;
  inbound: string;
  reply: string;
};

/** MRZ et numéros de pièce. Un vol AF1876 reste. */
export function redactConciergeExport(text: string) {
  return text
    .replace(/[A-Z0-9<]{20,}/g, "[retiré]")
    .replace(/\b[A-Z]{1,2}\d{6,9}\b/g, "[retiré]")
    .replace(/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{8,10}\b/g, "[retiré]")
    .replace(/\b\d{8,9}\b/g, "[retiré]");
}

/** Une réponse notée mauvaise, avec le message client qui la précède. */
export function badReplyCases(messages: ConciergeMarkedMessage[]): ConciergeBadCase[] {
  const groups = new Map<string, ConciergeMarkedMessage[]>();
  for (const row of messages) {
    const key = row.customer_id || row.id;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const cases: ConciergeBadCase[] = [];
  for (const rows of groups.values()) {
    const ordered = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (let index = 0; index < ordered.length; index += 1) {
      const row = ordered[index];
      if (row.concierge_mark !== "bad" || row.direction !== "outbound") continue;
      const inbound = [...ordered.slice(0, index)].reverse().find((item) => item.direction === "inbound");
      cases.push({
        id: row.id,
        at: row.created_at,
        inbound: redactConciergeExport(inbound?.body || ""),
        reply: redactConciergeExport(row.body),
      });
    }
  }
  return cases.sort((a, b) => a.at.localeCompare(b.at));
}
