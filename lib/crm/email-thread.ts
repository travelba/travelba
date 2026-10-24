import { hotelRefsShareBooking } from "@/lib/crm/item-match";

/** Un fil Gmail, ou une même confirmation, = une carte dans la file. */

export type ThreadRow = {
  id: string;
  gmail_thread_id?: string | null;
  subject?: string | null;
  received_at?: string | null;
  status?: string | null;
  grouped_into?: string | null;
  confirmation_refs?: string[] | null;
  extract?: unknown;
};

export function confirmationTokens(row: ThreadRow): string[] {
  const stored = Array.isArray(row.confirmation_refs) ? row.confirmation_refs : [];
  const extract =
    row.extract && typeof row.extract === "object"
      ? (row.extract as { items?: { confirmation_ref?: string | null }[] })
      : null;
  const fromItems = (extract?.items || []).map((item) => item?.confirmation_ref || "");
  const tokens = [...stored, ...fromItems]
    .flatMap((value) => String(value || "").toUpperCase().split(/[\s;,/|]+/))
    .map((token) => token.replace(/[^A-Z0-9]/g, ""))
    .filter((token) => token.length >= 4);
  return [...new Set(tokens)].sort();
}

/** Clé affichée. Le regroupement réel passe par `sharesInboxGroup` (fil ou confirmation). */
export function inboxGroupKey(row: ThreadRow): string {
  const thread = (row.gmail_thread_id || "").trim();
  if (thread) return `thread:${thread}`;
  const refs = confirmationTokens(row);
  if (refs.length) return `ref:${refs[0]}`;
  return `id:${row.id}`;
}

function refsAlign(a: string[], b: string[]) {
  return a.some((left) => b.some((right) => left === right || hotelRefsShareBooking(left, right)));
}

export function sharesInboxGroup(a: ThreadRow, b: ThreadRow) {
  const leftThread = (a.gmail_thread_id || "").trim();
  const rightThread = (b.gmail_thread_id || "").trim();
  if (leftThread && leftThread === rightThread) return true;
  return refsAlign(confirmationTokens(a), confirmationTokens(b));
}

export type InboxGroup<T extends ThreadRow> = { primary: T; members: T[] };

/** La file montre le message le plus récent du fil. Les autres restent derrière. */
export function collapseInboxRows<T extends ThreadRow>(rows: T[]): InboxGroup<T>[] {
  const active = rows.filter((row) => !row.grouped_into);
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const current = parent.get(id) || id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const unite = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  };
  for (const row of active) parent.set(row.id, row.id);
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      if (sharesInboxGroup(active[i], active[j])) unite(active[i].id, active[j].id);
    }
  }
  const buckets = new Map<string, T[]>();
  for (const row of active) {
    const root = find(row.id);
    const list = buckets.get(root) || [];
    list.push(row);
    buckets.set(root, list);
  }
  const groups = [...buckets.values()].map((members) => {
    const sorted = [...members].sort((a, b) => (b.received_at || "").localeCompare(a.received_at || ""));
    return { primary: sorted[0], members: sorted };
  });
  groups.sort((a, b) => (b.primary.received_at || "").localeCompare(a.primary.received_at || ""));
  return groups;
}

export function countInboxCards(rows: ThreadRow[]) {
  return collapseInboxRows(rows).length;
}

/** Parent déjà ouvert pour un message nouveau. Le plus ancien du fil. */
export function openThreadParent<T extends ThreadRow>(row: T, openRows: T[]): T | null {
  const others = openRows.filter((other) => other.id !== row.id && !other.grouped_into && sharesInboxGroup(row, other));
  if (!others.length) return null;
  return [...others].sort((a, b) => (a.received_at || "").localeCompare(b.received_at || ""))[0];
}
