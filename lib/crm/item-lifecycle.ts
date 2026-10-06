import { findMatchingItem } from "@/lib/crm/item-match";
import { countsAsCarnetCard, isActiveItem } from "@/lib/crm/types";

export type LifecycleCard = {
  id: string;
  kind: string;
  title?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
  lifecycle?: string | null;
  amount?: number | null;
  include_in_ledger?: boolean | null;
};

export type IncomingCard = {
  kind?: string | null;
  title?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

export type CancellationApplyPlan = {
  cancelBooking: boolean;
  itemIds: string[];
  /** Cartes actives, mais aucune référence du mail ne les désigne. */
  needsCardChoice: boolean;
};

function carnetCards(items: LifecycleCard[]) {
  return items.filter((row) => countsAsCarnetCard(row.kind));
}

/**
 * Cartes actives à retirer. Le dossier n’est annulé que s’il ne reste plus de carte.
 * Sans référence, et s’il reste des cartes, l’agence choisit. Une carte déjà
 * remplacée ne fait pas annuler le séjour.
 */
export function cancellationApplyPlan(
  extract: { items?: IncomingCard[] | null },
  items: LifecycleCard[]
): CancellationApplyPlan {
  const active = items.filter((row) => isActiveItem(row));
  const retired = items.filter((row) => !isActiveItem(row));
  const remaining = [...active];
  const itemIds: string[] = [];
  let matchedRetired = false;
  for (const incoming of extract.items || []) {
    const hit = findMatchingItem(remaining, { ...incoming, kind: incoming.kind || "" });
    if (hit) {
      itemIds.push(hit.id);
      const idx = remaining.findIndex((row) => row.id === hit.id);
      if (idx >= 0) remaining.splice(idx, 1);
      continue;
    }
    if (findMatchingItem(retired, { ...incoming, kind: incoming.kind || "" })) matchedRetired = true;
  }
  const unique = [...new Set(itemIds)];
  const leftover = carnetCards(remaining);
  if (unique.length) {
    return { cancelBooking: leftover.length === 0, itemIds: unique, needsCardChoice: false };
  }
  if (matchedRetired) {
    return { cancelBooking: false, itemIds: [], needsCardChoice: false };
  }
  if (leftover.length) {
    return { cancelBooking: false, itemIds: [], needsCardChoice: true };
  }
  return { cancelBooking: true, itemIds: [], needsCardChoice: false };
}

/** Une annulation dont la référence désigne déjà une carte, ou une carte déjà remplacée. */
export function cancellationIsSettled(plan: CancellationApplyPlan) {
  if (plan.needsCardChoice) return false;
  if (plan.itemIds.length > 0) return true;
  return !plan.cancelBooking;
}

function dayOf(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
}

/** Début et fin du séjour d’après les cartes encore actives. */
export function activeCardDateRange(
  items: { kind?: string | null; lifecycle?: string | null; start_at?: string | null; end_at?: string | null }[]
): { start: string | null; end: string | null } {
  let start: string | null = null;
  let end: string | null = null;
  for (const item of items) {
    if (!isActiveItem(item) || !countsAsCarnetCard(item.kind)) continue;
    const itemStart = dayOf(item.start_at);
    const itemEnd = dayOf(item.end_at) || itemStart;
    if (itemStart && (!start || itemStart < start)) start = itemStart;
    if (itemEnd && (!end || itemEnd > end)) end = itemEnd;
  }
  return { start, end };
}

/** Même référence, carte déjà montrée : elle le reste. Une carte nouvelle reste cachée. */
export function cardStaysShown(
  match: { visible_to_client?: boolean | null } | null | undefined,
  keepSellingPrice: boolean
) {
  return Boolean(match && keepSellingPrice && match.visible_to_client);
}

export type ReplacementPlan = {
  updates: { itemId: string }[];
  replacements: { itemId: string; kind: string; amount: number | null; includeInLedger: boolean }[];
  adds: number;
  choices: { id: string; kind: string; title: string }[];
};

function choiceRow(row: LifecycleCard) {
  return { id: row.id, kind: row.kind, title: (row.title || "").trim() || "Carte" };
}

/**
 * Même référence : mettre à jour la carte. Autre référence : remplacer la carte
 * du même type, ou demander laquelle s’il y en a plusieurs.
 */
export function replacementPlan(
  incoming: IncomingCard[],
  existing: LifecycleCard[],
  chosenId?: string | null
): ReplacementPlan {
  const active = existing.filter((row) => isActiveItem(row));
  const retired = existing.filter((row) => !isActiveItem(row));
  const pool = [...active];
  const updates: { itemId: string }[] = [];
  const unmatched: IncomingCard[] = [];
  for (const item of incoming) {
    const kind = item.kind || "";
    if (!countsAsCarnetCard(kind) || !(item.title || "").trim()) continue;
    const hit = findMatchingItem(pool, {
      kind,
      confirmation_ref: item.confirmation_ref,
      start_at: item.start_at,
      title: item.title,
      details: item.details || null,
    });
    if (!hit) {
      unmatched.push(item);
      continue;
    }
    updates.push({ itemId: hit.id });
    const idx = pool.findIndex((row) => row.id === hit.id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  const replacements: ReplacementPlan["replacements"] = [];
  const choices: ReplacementPlan["choices"] = [];
  let adds = 0;
  const byKind = new Map<string, IncomingCard[]>();
  for (const item of unmatched) {
    const kind = item.kind || "";
    const list = byKind.get(kind) || [];
    list.push(item);
    byKind.set(kind, list);
  }
  for (const [kind, group] of byKind) {
    const candidates = pool.filter((row) => row.kind === kind);
    const retiredKind = retired.filter((row) => row.kind === kind);
    const targets = candidates.length ? candidates : retiredKind;
    if (!targets.length) {
      adds += group.length;
      continue;
    }
    if (targets.length === 1 && group.length === 1) {
      const target = targets[0];
      replacements.push({
        itemId: target.id,
        kind: target.kind,
        amount: target.amount ?? null,
        includeInLedger: Boolean(target.include_in_ledger),
      });
      continue;
    }
    if (chosenId && group.length === 1 && targets.some((row) => row.id === chosenId)) {
      const target = targets.find((row) => row.id === chosenId)!;
      replacements.push({
        itemId: target.id,
        kind: target.kind,
        amount: target.amount ?? null,
        includeInLedger: Boolean(target.include_in_ledger),
      });
      continue;
    }
    for (const row of targets) {
      if (!choices.some((choice) => choice.id === row.id)) choices.push(choiceRow(row));
    }
  }
  return { updates, replacements, adds, choices };
}

export type InboxStayAction = {
  action: "attach" | "replace" | "cancel";
  label: string;
  itemId: string | null;
  choices: { id: string; kind: string; title: string }[];
  hint: string;
};

const REPLACE_HINT =
  "Le prix vendu reste celui déjà saisi. Le client voit la nouvelle carte quand vous montrez le séjour.";
const CANCEL_CARD_HINT = "Seule cette carte sort du total et du carnet. L’argent déjà reçu reste.";
const CANCEL_STAY_HINT = "Le séjour est annulé. Le débit disparaît. L’argent déjà reçu reste un avoir.";

/** Geste de la file : mettre à jour, remplacer, ou annuler. Jamais un deuxième dossier. */
export function inboxStayAction(input: {
  documentStatus?: string | null;
  incoming: IncomingCard[];
  bookingStatus?: string | null;
  items: LifecycleCard[];
  chosenItemId?: string | null;
}): InboxStayAction {
  const reopen = input.bookingStatus === "cancelled";
  const replaceLabel = reopen ? "Rouvrir et remplacer" : "Remplacer sur ce dossier";
  if (input.documentStatus === "cancelled") {
    const plan = cancellationApplyPlan({ items: input.incoming }, input.items);
    if (plan.needsCardChoice) {
      const choices = input.items.filter((row) => isActiveItem(row) && countsAsCarnetCard(row.kind)).map(choiceRow);
      const chosen = input.chosenItemId && choices.some((row) => row.id === input.chosenItemId) ? input.chosenItemId : null;
      return {
        action: "cancel",
        label: "Annuler cette carte",
        itemId: chosen,
        choices,
        hint: CANCEL_CARD_HINT,
      };
    }
    if (plan.cancelBooking) {
      return {
        action: "cancel",
        label: "Annuler le séjour",
        itemId: null,
        choices: [],
        hint: CANCEL_STAY_HINT,
      };
    }
    if (plan.itemIds.length) {
      return {
        action: "cancel",
        label: "Annuler la carte",
        itemId: null,
        choices: [],
        hint: CANCEL_CARD_HINT,
      };
    }
    return {
      action: "attach",
      label: "Classer l’annulation",
      itemId: null,
      choices: [],
      hint: "Cette réservation est déjà remplacée. Le séjour en cours ne change pas.",
    };
  }

  const open = replacementPlan(input.incoming, input.items);
  const plan = replacementPlan(input.incoming, input.items, input.chosenItemId);
  if (open.choices.length) {
    const itemId = plan.choices.length ? null : plan.replacements[0]?.itemId || null;
    return {
      action: "replace",
      label: replaceLabel,
      itemId,
      choices: open.choices,
      hint: REPLACE_HINT,
    };
  }
  if (plan.replacements.length) {
    return {
      action: "replace",
      label: replaceLabel,
      itemId: plan.replacements.length === 1 ? plan.replacements[0].itemId : null,
      choices: [],
      hint: REPLACE_HINT,
    };
  }
  if (plan.updates.length) {
    return {
      action: "attach",
      label: "Mettre à jour la carte",
      itemId: null,
      choices: [],
      hint: REPLACE_HINT,
    };
  }
  return {
    action: "attach",
    label: "Rattacher au voyage",
    itemId: null,
    choices: [],
    hint: "",
  };
}
