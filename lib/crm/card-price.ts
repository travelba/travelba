import { isActiveItem, isExtraItemKind, isLedgerExpenseKind } from "@/lib/crm/types";

/** Avec prix : le prix de vente est obligatoire et la carte a sa ligne de vente. */
export type CardPriceMode = "avec" | "sans";
/** Cartes : un prix par carte. Forfait : un seul prix pour le voyage. */
export type StayPriceMode = "cartes" | "forfait";

const CARD_MODES = new Set<CardPriceMode>(["avec", "sans"]);
const STAY_MODES = new Set<StayPriceMode>(["cartes", "forfait"]);

export function readCardPriceMode(item: {
  amount?: number | string | null;
  price_mode?: string | null;
  details?: Record<string, unknown> | null;
}): CardPriceMode {
  const stamped = item.details?.price_mode;
  if (stamped === "avec" || stamped === "sans") return stamped;
  if (item.price_mode === "avec" || item.price_mode === "sans") return item.price_mode;
  const amount = Number(item.amount);
  if (Number.isFinite(amount) && amount !== 0) return "avec";
  return "sans";
}

export function readStayPriceMode(booking: { price_mode?: string | null } | null | undefined): StayPriceMode {
  return booking?.price_mode === "forfait" ? "forfait" : "cartes";
}

export function readForfaitAmount(booking: { forfait_amount?: number | string | null } | null | undefined): number | null {
  const amount = Number(booking?.forfait_amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export function cardPriceError(mode: CardPriceMode, amount: number | null | undefined) {
  if (mode !== "avec") return null;
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return "Indiquez le prix de vente.";
  return null;
}

export function forfaitPriceError(mode: StayPriceMode, amount: number | null | undefined) {
  if (mode !== "forfait") return null;
  if (readForfaitAmount({ forfait_amount: amount }) == null) return "Indiquez le prix forfait du voyage.";
  return null;
}

/** Le client voit un prix sur cette carte. Un forfait n’en montre aucun. */
export function clientSeesCardPrice(
  item: { amount?: number | string | null; price_mode?: string | null; details?: Record<string, unknown> | null },
  stayMode: StayPriceMode = "cartes"
) {
  if (stayMode === "forfait") return false;
  return readCardPriceMode(item) === "avec";
}

export function withCardPriceMode(details: Record<string, unknown> | null | undefined, mode: CardPriceMode) {
  return { ...(details || {}), price_mode: mode };
}

/**
 * Choix MCP : avec_prix, sans_prix, ou un montant.
 * Rien d’indiqué : null, l’appelant laisse le mode déjà là (création : sans prix).
 */
export function mcpPriceChoice(input: {
  avec_prix?: unknown;
  sans_prix?: unknown;
  prix?: number | null;
  prix_total?: number | null;
}): { mode: CardPriceMode } | { mode: null } | { error: string } {
  const avec = input.avec_prix === true;
  const sans = input.sans_prix === true;
  if (avec && sans) return { error: "Choisissez avec prix ou sans prix." };
  const priced = (input.prix != null && input.prix > 0) || (input.prix_total != null && input.prix_total > 0);
  const zero = input.prix === 0 || input.prix_total === 0;
  if (sans && priced) return { error: "Sans prix ne porte pas de montant." };
  if (sans || zero) return { mode: "sans" };
  if (avec && !priced) return { error: "Indiquez le prix de vente." };
  if (avec || priced) return { mode: "avec" };
  return { mode: null };
}

export function parseStayPriceMode(value: unknown): StayPriceMode | null {
  if (value === "cartes" || value === "forfait") return value;
  if (typeof value === "string" && STAY_MODES.has(value as StayPriceMode)) return value as StayPriceMode;
  return null;
}

export function parseCardPriceMode(value: unknown): CardPriceMode | null {
  if (value === "avec" || value === "sans") return value;
  if (typeof value === "string" && CARD_MODES.has(value as CardPriceMode)) return value as CardPriceMode;
  return null;
}

type SaleCard = {
  id: string;
  kind?: string | null;
  /** Prix de vente déjà calculé (vol × billets compris). */
  selling?: number | null;
  amount?: number | string | null;
  details?: Record<string, unknown> | null;
  lifecycle?: string | null;
  price_mode?: string | null;
  visible_to_client?: boolean | null;
};

export type PlannedSaleLine =
  | { key: "forfait"; amount: number }
  | { key: "carte"; itemId: string; amount: number; visible: boolean };

/**
 * Lignes de vente du dossier.
 * Une carte « Avec prix » compte même si elle est masquée.
 * Le séjour encore caché, annulé ou archivé ne débite pas.
 * Le forfait remplace toutes les cartes par une seule ligne.
 */
export function plannedSaleLines(input: {
  stayVisible: boolean;
  cancelled?: boolean;
  archived?: boolean;
  clientSettles?: boolean;
  stayMode: StayPriceMode;
  forfaitAmount?: number | null;
  cards: SaleCard[];
}): PlannedSaleLine[] {
  if (input.cancelled || input.archived || !input.stayVisible) return [];
  if (input.stayMode === "forfait") {
    if (input.clientSettles) return [];
    const amount = readForfaitAmount({ forfait_amount: input.forfaitAmount });
    if (amount == null) return [];
    return [{ key: "forfait", amount }];
  }
  if (input.clientSettles) return [];
  const lines: PlannedSaleLine[] = [];
  for (const card of input.cards) {
    if (!isActiveItem(card) || isExtraItemKind(card.kind) || isLedgerExpenseKind(card.kind)) continue;
    if (card.kind === "fee") continue;
    if (readCardPriceMode(card) !== "avec") continue;
    const amount = Number(card.selling);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    lines.push({
      key: "carte",
      itemId: card.id,
      amount,
      visible: card.visible_to_client !== false,
    });
  }
  return lines;
}

/** Les frais de billeterie ne sont plus créés ni retirés par le calcul. */
export function automaticTicketingWrites() {
  return false;
}
