import type { ClientLedgerView } from "./client-ledger";
import type { TripAccountingView } from "./trip-costs";
import type { CrmBookingItem } from "./types";

/**
 * Ce que l’onglet Argent affiche après une lecture.
 * `revision` est l’horloge du serveur au début de la lecture.
 * `layer` départage deux lectures de la même page : 0 base, 1 Stripe, 2 enregistrement.
 */
export type ArgentIncoming = {
  revision: number;
  layer?: number;
  accounting?: TripAccountingView | null;
  /** La file des sorties n’a pas été relue : garder celle déjà à l’écran. */
  keepProposed?: boolean;
  ledger?: ClientLedgerView | null;
  accountLedger?: ClientLedgerView | null;
  items?: CrmBookingItem[] | null;
  agencyCommission?: boolean;
};

export type ArgentHeld = {
  revision: number;
  layer: number;
  accounting: TripAccountingView | null;
  ledger: ClientLedgerView | null;
  accountLedger: ClientLedgerView | null;
  items: CrmBookingItem[] | null;
  agencyCommission: boolean | null;
};

const memory = new Map<string, ArgentHeld>();

export function rememberArgent(bookingId: string, held: ArgentHeld) {
  memory.set(bookingId, held);
  if (memory.size <= 4) return;
  const oldest = memory.keys().next().value;
  if (oldest && oldest !== bookingId) memory.delete(oldest);
}

export function recallArgent(bookingId: string): ArgentHeld | null {
  return memory.get(bookingId) ?? null;
}

export function resetArgentMemory() {
  memory.clear();
}

/** Une file déjà proposée reste, le prix vendu et la marge viennent de la lecture. */
export function mergeArgentAccounting(
  previous: TripAccountingView | null,
  fresh: TripAccountingView,
  keepProposed: boolean
): TripAccountingView {
  if (!keepProposed || !previous?.proposed.length) return fresh;
  return {
    ...fresh,
    proposed: previous.proposed,
    state: "a_pointer",
  };
}

/**
 * La lecture la plus récente gagne. Une restauration de l’ancienne page
 * (onglet changé via l’historique) ne réécrit pas un prix déjà enregistré.
 * À génération égale, Stripe (1) couvre la base (0), et l’enregistrement (2) couvre Stripe.
 */
export function acceptArgent(held: ArgentHeld | null, incoming: ArgentIncoming): ArgentHeld {
  const layer = incoming.layer ?? 0;
  if (held && (incoming.revision < held.revision || (incoming.revision === held.revision && layer < held.layer))) {
    if (!held.accounting && incoming.accounting) {
      return { ...held, accounting: mergeArgentAccounting(null, incoming.accounting, false) };
    }
    return held;
  }
  return {
    revision: incoming.revision,
    layer,
    accounting:
      incoming.accounting == null
        ? held?.accounting ?? null
        : mergeArgentAccounting(held?.accounting ?? null, incoming.accounting, incoming.keepProposed === true),
    ledger: incoming.ledger ?? held?.ledger ?? null,
    accountLedger: incoming.accountLedger ?? held?.accountLedger ?? null,
    items: incoming.items !== undefined ? incoming.items : held?.items ?? null,
    agencyCommission:
      incoming.agencyCommission !== undefined ? incoming.agencyCommission : held?.agencyCommission ?? null,
  };
}

type MoneyItem = {
  id: string;
  amount?: number | null;
  include_in_ledger?: boolean | null;
  lifecycle?: string | null;
  kind?: string;
  title?: string;
  visible_to_client?: boolean;
  billing_company_id?: string | null;
  details?: Record<string, unknown> | null;
};

export function moneyFieldsEqual<T extends MoneyItem>(left: T[], right: T[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return Boolean(
      other &&
        item.id === other.id &&
        item.amount === other.amount &&
        Boolean(item.include_in_ledger) === Boolean(other.include_in_ledger) &&
        (item.lifecycle || "") === (other.lifecycle || "") &&
        item.kind === other.kind &&
        item.title === other.title &&
        Boolean(item.visible_to_client) === Boolean(other.visible_to_client)
    );
  });
}

/** Prix, case « Inclure dans les transactions », ajout et retrait. Le reste de la carte (photos, contacts) reste. */
export function mergeItemMoney<T extends MoneyItem>(current: T[], fresh: T[]): T[] {
  const byId = new Map(fresh.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of current) {
    const next = byId.get(item.id);
    if (!next) continue;
    seen.add(item.id);
    merged.push({
      ...item,
      amount: next.amount,
      include_in_ledger: next.include_in_ledger,
      lifecycle: next.lifecycle,
      kind: next.kind,
      title: next.title,
      visible_to_client: next.visible_to_client,
      billing_company_id: next.billing_company_id,
      details: { ...(item.details || {}), ...(next.details || {}) },
    });
  }
  for (const item of fresh) {
    if (!seen.has(item.id)) merged.push(item);
  }
  return merged;
}
