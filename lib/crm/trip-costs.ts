/**
 * Comptabilité du voyage.
 * Un coût = une sortie Pliant ou Revolut rattachée à une ligne vendue du dossier.
 * Une vente = un débit posté du grand livre (carte, dépense, frais, ou le montant global du séjour).
 * Marge = vente − somme des coûts. Le client ne voit que la vente.
 */

import { isStayRollupDebit } from "./ledger-display";
import { matchTokens, normalizeMatchText } from "./revolut-match";

export type TripCostSource = "pliant" | "revolut";

export type TripCost = {
  id: string;
  bookingId: string;
  bookingItemId: string | null;
  source: TripCostSource;
  sourceId: string;
  amountEur: number;
  originalAmount: number | null;
  originalCurrency: string | null;
  supplier: string | null;
  occurredOn: string | null;
};

export type TripCostDraft = Omit<TripCost, "id" | "bookingId" | "bookingItemId">;

export type TripCostRow = {
  id: string;
  booking_id: string;
  booking_item_id: string | null;
  source: string;
  source_id: string;
  amount_eur: number | string;
  original_amount: number | string | null;
  original_currency: string | null;
  supplier: string | null;
  occurred_on: string | null;
};

export function mapTripCost(row: TripCostRow): TripCost {
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    bookingItemId: row.booking_item_id ? String(row.booking_item_id) : null,
    source: row.source === "revolut" ? "revolut" : "pliant",
    sourceId: String(row.source_id),
    amountEur: round(Number(row.amount_eur)),
    originalAmount: row.original_amount == null ? null : round(Number(row.original_amount)),
    originalCurrency: row.original_currency ? String(row.original_currency).toUpperCase() : null,
    supplier: row.supplier || null,
    occurredOn: row.occurred_on ? String(row.occurred_on).slice(0, 10) : null,
  };
}

const PLIANT_POSTABLE = new Set(["BOOKED", "CONFIRMED"]);
const PLIANT_OUT = new Set(["PURCHASE", "CASH_WITHDRAWAL"]);
const PLIANT_IN = new Set(["REFUND", "CHARGEBACK"]);

/** Une dépense Pliant comptabilisée devient un coût ; un remboursement, un coût négatif. */
export function tripCostFromPliant(row: {
  id: string;
  status: string | null;
  type: string | null;
  merchant: string | null;
  billing_cents: number | null;
  billing_currency: string | null;
  transaction_cents: number | null;
  transaction_currency: string | null;
  booked_at: string | null;
}): TripCostDraft | null {
  const status = (row.status || "").toUpperCase();
  const type = (row.type || "").toUpperCase();
  if (!PLIANT_POSTABLE.has(status)) return null;
  const sign = PLIANT_OUT.has(type) ? 1 : PLIANT_IN.has(type) ? -1 : 0;
  if (!sign) return null;
  const cents = Number(row.billing_cents);
  if (!Number.isFinite(cents) || Math.round(Math.abs(cents)) === 0) return null;
  const currency = (row.billing_currency || "EUR").toUpperCase();
  if (currency !== "EUR") return null;
  return {
    source: "pliant",
    sourceId: row.id,
    amountEur: round((sign * Math.abs(Math.round(cents))) / 100),
    originalAmount:
      row.transaction_cents == null || !Number.isFinite(Number(row.transaction_cents))
        ? null
        : round(Math.abs(Number(row.transaction_cents)) / 100),
    originalCurrency: (row.transaction_currency || currency).toUpperCase(),
    supplier: (row.merchant || "").trim() || null,
    occurredOn: row.booked_at ? String(row.booked_at).slice(0, 10) : null,
  };
}

/**
 * Une sortie Revolut devient un coût. Hors euros, l’agent donne le coût en euros.
 * Un crédit (remboursement d’un fournisseur) devient un coût négatif.
 */
export function tripCostFromRevolut(
  row: {
    id: string;
    direction: string;
    amount: number | string;
    currency: string;
    counterparty_name: string | null;
    booked_at: string | null;
  },
  eurAmount?: number | null
): TripCostDraft | null {
  const amount = Math.abs(Number(row.amount));
  if (!Number.isFinite(amount) || amount === 0) return null;
  const currency = (row.currency || "EUR").toUpperCase();
  const sign = row.direction === "credit" ? -1 : 1;
  let eur: number | null = null;
  if (currency === "EUR") eur = amount;
  else if (eurAmount != null && Number.isFinite(Number(eurAmount)) && Number(eurAmount) > 0) eur = Number(eurAmount);
  if (eur == null) return null;
  return {
    source: "revolut",
    sourceId: row.id,
    amountEur: round(sign * eur),
    originalAmount: round(amount),
    originalCurrency: currency,
    supplier: (row.counterparty_name || "").trim() || null,
    occurredOn: row.booked_at ? String(row.booked_at).slice(0, 10) : null,
  };
}

export type SaleLedgerRow = {
  id: string;
  booking_id?: string | null;
  direction: string;
  kind?: string | null;
  status?: string | null;
  currency?: string | null;
  amount: number | string;
  label?: string | null;
  external_id?: string | null;
};

export type SaleLine = {
  transactionId: string;
  /** Carte ou dépense. Nul pour le montant global du séjour et les frais. */
  itemId: string | null;
  /** `item`, `stay`, `fee` */
  nature: "item" | "stay" | "fee";
  label: string;
  sale: number;
};

const ITEM_ID = /:(?:item|expense):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function saleItemId(externalId: string | null | undefined) {
  return externalId?.match(ITEM_ID)?.[1] || null;
}

/** Les ventes d’un dossier : ses débits postés en euros. */
export function saleLines(rows: SaleLedgerRow[], bookingId: string): SaleLine[] {
  return rows
    .filter(
      (row) =>
        row.booking_id === bookingId &&
        row.direction === "debit" &&
        (!row.status || row.status === "posted") &&
        (!row.currency || row.currency.toUpperCase() === "EUR")
    )
    .map((row) => {
      const itemId = saleItemId(row.external_id);
      const rollup =
        row.kind == null
          ? !row.external_id
          : isStayRollupDebit({ direction: row.direction, kind: row.kind, external_id: row.external_id || null });
      const nature: SaleLine["nature"] = itemId ? "item" : rollup ? "stay" : "fee";
      return {
        transactionId: row.id,
        itemId,
        nature,
        label: (row.label || "").trim() || (nature === "stay" ? "Séjour" : "Dépense"),
        sale: round(Number(row.amount)),
      };
    })
    .filter((line) => line.sale > 0);
}

export type AccountedLine = SaleLine & {
  cost: number;
  margin: number;
  costs: TripCost[];
};

/**
 * Chaque coût rejoint sa ligne : la carte ou la dépense, sinon le montant global du séjour.
 * Un coût dont la ligne n’est pas au grand livre reste « hors vente ».
 */
export function accountLines(lines: SaleLine[], costs: TripCost[]) {
  const byItem = new Map<string, TripCost[]>();
  const loose: TripCost[] = [];
  for (const cost of costs) {
    if (cost.bookingItemId) {
      const list = byItem.get(cost.bookingItemId) || [];
      list.push(cost);
      byItem.set(cost.bookingItemId, list);
    } else loose.push(cost);
  }
  const stay = lines.find((line) => line.nature === "stay") || null;
  const accounted: AccountedLine[] = lines.map((line) => {
    const own = line.itemId ? byItem.get(line.itemId) || [] : [];
    const attached = line === stay ? [...own, ...loose] : own;
    const cost = round(attached.reduce((sum, item) => sum + item.amountEur, 0));
    return { ...line, costs: attached, cost, margin: round(line.sale - cost) };
  });
  const unsold: TripCost[] = [];
  for (const [itemId, list] of byItem) {
    if (!lines.some((line) => line.itemId === itemId)) unsold.push(...list);
  }
  if (!stay) unsold.push(...loose);
  return { lines: accounted, unsold };
}

export type TripAccountingTotals = {
  sale: number;
  cost: number;
  margin: number;
  unsoldCost: number;
};

export function tripTotals(lines: AccountedLine[], unsold: TripCost[]): TripAccountingTotals {
  const sale = round(lines.reduce((sum, line) => sum + line.sale, 0));
  const unsoldCost = round(unsold.reduce((sum, cost) => sum + cost.amountEur, 0));
  const cost = round(lines.reduce((sum, line) => sum + line.cost, 0) + unsoldCost);
  return { sale, cost, margin: round(sale - cost), unsoldCost };
}

export type TripAccountingState = "a_pointer" | "pointe" | "comptabilise";

/**
 * À pointer : une sortie proposée attend, ou un coût n’a pas de vente.
 * Pointé : tout rattaché, facture préparée.
 * Comptabilisé : facture imprimée, marge à jour.
 */
export function tripAccountingState(input: {
  proposedCount: number;
  unsoldCount: number;
  invoiceNumber: string | null;
  invoicePrinted: boolean;
  marginStale: boolean;
}): TripAccountingState {
  if (input.proposedCount > 0 || input.unsoldCount > 0) return "a_pointer";
  if (input.invoiceNumber && input.invoicePrinted && !input.marginStale) return "comptabilise";
  return "pointe";
}

export const TRIP_ACCOUNTING_LABELS: Record<TripAccountingState, string> = {
  a_pointer: "À pointer",
  pointe: "Pointé",
  comptabilise: "Comptabilisé",
};

/** Marge par transaction du grand livre, pour la ligne MB3M. Seules les lignes pointées (au moins un coût) y figurent. */
export function marginByTransaction(lines: AccountedLine[]) {
  const map = new Map<string, { margin: number; suppliers: string[] }>();
  for (const line of lines) {
    if (!line.costs.length) continue;
    const suppliers = [...new Set(line.costs.map((cost) => (cost.supplier || "").trim()).filter(Boolean))];
    map.set(line.transactionId, { margin: line.margin, suppliers });
  }
  return map;
}

const REFERENCE = /\bTB-\d{4}-\d{4}\b/i;

export function referenceInText(text: string | null | undefined) {
  return text?.match(REFERENCE)?.[0]?.toUpperCase() || null;
}

export type CostTargetItem = {
  id: string;
  kind: string | null;
  title: string | null;
  supplier?: string | null;
  amount: number | null;
  details?: Record<string, unknown> | null;
  lifecycle?: string | null;
};

export type CostTargetBooking = {
  id: string;
  reference: string;
  title: string | null;
  destination?: string | null;
  customerId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  items: CostTargetItem[];
};

export type CostSuggestion = {
  bookingId: string;
  itemId: string | null;
  score: number;
  reason: "reference" | "card" | "client" | "supplier" | "amount";
};

/** Jours autour du voyage pendant lesquels une dépense du client lui appartient sans doute. */
const CLIENT_WINDOW_DAYS = 10;

function withinTrip(date: string | null | undefined, booking: CostTargetBooking) {
  if (!date || !booking.startDate) return true;
  const day = Date.parse(date.slice(0, 10));
  const start = Date.parse(booking.startDate) - CLIENT_WINDOW_DAYS * 86_400_000;
  const end = Date.parse(booking.endDate || booking.startDate) + CLIENT_WINDOW_DAYS * 86_400_000;
  return Number.isFinite(day) && day >= start && day <= end;
}

function itemNames(item: CostTargetItem) {
  const details = item.details || {};
  const names = [item.title, item.supplier, details.hotel_name, details.airline, details.operator];
  return names
    .map((value) => (typeof value === "string" ? normalizeMatchText(value) : ""))
    .filter((value) => value.length >= 3);
}

/** Mots trop courants pour désigner un fournisseur : « spa » ne rapproche pas El Silencio de l’Hivernage. */
const GENERIC_SUPPLIER_WORDS = new Set([
  "hotel", "hotels", "hostel", "spa", "lodge", "lodges", "resort", "resorts", "inn", "suites", "suite",
  "villa", "villas", "palace", "riad", "club", "beach", "golf", "boutique", "collection", "group", "groupe",
  "the", "and", "les", "des", "del", "de", "la", "le", "el", "los", "las", "by", "air", "airline", "airlines",
  "airways", "travel", "trvl", "tours", "voyages", "voyage", "sarl", "sas", "ltd", "llc", "inc", "gmbh", "co",
  "international", "paris", "www", "com", "fr",
]);

function supplierTokens(value: string | null | undefined) {
  return matchTokens(value).filter((token) => token.length >= 3 && !GENERIC_SUPPLIER_WORDS.has(token) && !/^\d+$/.test(token));
}

function nameHit(party: string | null | undefined, item: CostTargetItem) {
  const tokens = supplierTokens(party);
  if (!tokens.length) return false;
  const names = itemNames(item);
  return names.some((name) => tokens.some((token) => name.includes(token) || (name.length >= 4 && token.includes(name))));
}

function amountHit(amount: number, item: CostTargetItem) {
  const price = Number(item.amount);
  return Number.isFinite(price) && price > 0 && Math.abs(price - Math.abs(amount)) < 0.005;
}

/** La ligne d’un dossier qui ressemble le plus à la sortie : nom du fournisseur, puis montant. */
export function suggestItem(
  booking: CostTargetBooking,
  input: { party: string | null | undefined; amount: number }
): { itemId: string | null; reason: "supplier" | "amount" | null } {
  const active = booking.items.filter((item) => item.lifecycle !== "superseded" && item.lifecycle !== "cancelled");
  const byName = active.find((item) => nameHit(input.party, item));
  if (byName) return { itemId: byName.id, reason: "supplier" };
  const byAmount = active.find((item) => amountHit(input.amount, item));
  if (byAmount) return { itemId: byAmount.id, reason: "amount" };
  return { itemId: null, reason: null };
}

/**
 * Mouvements qui ne se rattachent à aucun voyage : le prélèvement IATA (BSP) regroupe tous les
 * billets d’une période ; le virement de trésorerie vers Pliant (bénéficiaire l’agence elle-même,
 * désignation « treso Rev - pliant ») alimente les cartes. Aucune proposition, rien dans les dossiers.
 */
const SETTLEMENT_PARTY = /\bIATA\b|\bBSP\b|\bPLIANT\b|TRAVEL\s+BUSINESS\s+AGENCY/i;

export function isSettlementParty(text: string | null | undefined) {
  return SETTLEMENT_PARTY.test(text || "");
}

/**
 * Coûts fixes de l’agence : logiciels, IA, hébergement, téléphonie, eSIM. Jamais un coût de
 * voyage : ces sorties ne sont ni proposées ni montrées dans la file. « Free » seul en tête du
 * libellé, pour ne pas prendre un « Duty Free ».
 */
const FIXED_COST_PARTY =
  /\bOPEN ?AI\b|\bCHATGPT\b|\bCURSOR\b|\bVERCEL\b|\bGOOGLE\b|\bANTHROPIC\b|\bCLAUDE\.AI\b|\bPERPLEXITY\b|\bE ?SIMO\b|^\s*FREE\b|\bFREE\s+(?:MOBILE|TELECOM|PRO)\b/i;

export function isFixedCostParty(text: string | null | undefined) {
  return FIXED_COST_PARTY.test(text || "");
}

/** Sortie qui ne concerne aucun voyage : règlement global ou coût fixe. */
export function isNonTripParty(text: string | null | undefined) {
  return isSettlementParty(text) || isFixedCostParty(text);
}

/**
 * Propositions pour une sortie. La référence du dossier dans la désignation gagne,
 * puis la carte Pliant du dossier, puis les voyages du client de la carte autour de la date,
 * puis un fournisseur ou un montant qui correspond. Jamais d’écriture : l’agent clique.
 */
export function suggestCostTargets(
  input: {
    text: string | null | undefined;
    party: string | null | undefined;
    amount: number;
    cardBookingIds?: string[];
    /** Client porteur de la carte, quand Pliant le connaît. */
    customerId?: string | null;
    /** Jour de la sortie : départage les voyages du client. */
    date?: string | null;
  },
  bookings: CostTargetBooking[]
): CostSuggestion[] {
  if (isNonTripParty(input.party) || isSettlementParty(input.text)) return [];
  const out: CostSuggestion[] = [];
  const seen = new Set<string>();
  const push = (bookingId: string, itemId: string | null, score: number, reason: CostSuggestion["reason"]) => {
    if (seen.has(bookingId)) return;
    seen.add(bookingId);
    out.push({ bookingId, itemId, score, reason });
  };
  const reference = referenceInText(input.text) || referenceInText(input.party);
  if (reference) {
    const booking = bookings.find((row) => row.reference.toUpperCase() === reference);
    if (booking) push(booking.id, suggestItem(booking, input).itemId, 100, "reference");
  }
  for (const bookingId of input.cardBookingIds || []) {
    const booking = bookings.find((row) => row.id === bookingId);
    if (booking) push(booking.id, suggestItem(booking, input).itemId, 90, "card");
  }
  if (input.customerId) {
    const own = bookings.filter((row) => row.customerId === input.customerId);
    const around = own.filter((row) => withinTrip(input.date, row));
    for (const booking of around.length ? around : own) push(booking.id, suggestItem(booking, input).itemId, 80, "client");
  }
  for (const booking of bookings) {
    const hit = suggestItem(booking, input);
    if (hit.reason === "supplier") push(booking.id, hit.itemId, 70, "supplier");
  }
  for (const booking of bookings) {
    const hit = suggestItem(booking, input);
    if (hit.reason === "amount") push(booking.id, hit.itemId, 50, "amount");
  }
  return out.sort((left, right) => right.score - left.score);
}

/** Ce que l’agence sait d’une carte Pliant générée depuis un dossier. */
export type OutgoingCardInfo = {
  label: string | null;
  holder: string | null;
  limit: number | null;
  currency: string;
  validFrom: string | null;
  validTo: string | null;
  countries: string[];
  status: string | null;
  bookingReference?: string | null;
  bookingTitle?: string | null;
};

/** Un rattachement quasi certain : la référence du dossier, ou la carte générée depuis le dossier. */
export const SURE_SUGGESTION_SCORE = 90;

export function isSureSuggestion(hit: { score: number } | null | undefined) {
  return !!hit && hit.score >= SURE_SUGGESTION_SCORE;
}

/** Sortie à rattacher, telle que l’écran la reçoit. */
export type OutgoingLine = {
  source: TripCostSource;
  id: string;
  party: string;
  /** Montant et devise d’origine. */
  amount: number;
  currency: string;
  /** Coût en euros connu (Pliant, ou Revolut en euros). Nul : l’agent le saisit. */
  eurAmount: number | null;
  /** Négatif : remboursement reçu. */
  refund: boolean;
  occurredOn: string | null;
  card: string | null;
  text: string;
  kind: string;
  agencyCard: boolean;
  /** Carte Pliant générée depuis un dossier : porteur, plafond, validité, dossier d’origine. */
  cardInfo: OutgoingCardInfo | null;
  suggestions: (CostSuggestion & { reference: string; title: string; itemLabel: string | null })[];
};

export function costSuggestionReasonLabel(reason: CostSuggestion["reason"]) {
  switch (reason) {
    case "reference":
      return "Référence du dossier";
    case "card":
      return "Carte du dossier";
    case "client":
      return "Client de la carte";
    case "supplier":
      return "Fournisseur";
    default:
      return "Montant";
  }
}

export function round(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/** Le bloc « Coûts du voyage » de l’onglet Règlement, et la lecture MCP. */
export type TripAccountingView = {
  lines: AccountedLine[];
  unsold: TripCost[];
  totals: TripAccountingTotals;
  proposed: OutgoingLine[];
  state: TripAccountingState;
  invoice: {
    number: string | null;
    printed: boolean;
    marginStale: boolean;
    /** Lignes couvertes par une facture imprimée (id de transaction → n°). */
    byTransaction: Record<string, { number: string; printed: boolean }>;
    /** Somme des factures imprimées non annulées par un avoir. */
    printedTotal: number | null;
  };
  anomalies: string[];
};
