import { parseMoney } from "./money";

/**
 * Coût et marge affichés dans le tableau de rentabilité.
 * Le débit réel rattaché remplace le coût de la carte.
 * Sans débit, le coût net saisi sur la carte sert.
 * Ni l’un ni l’autre : coût 0. Une remise n’a pas de coût.
 * Rien n’est écrit : la marge MB3M reste celle des débits pointés.
 */

export type ProfitabilitySource = "real" | "theoretical" | "none";

export type LineProfitability = {
  sale: number;
  /** null : remise, la colonne coût reste vide. */
  cost: number | null;
  margin: number;
  source: ProfitabilitySource;
  /** Coût de la carte à rappeler quand un débit réel d’un autre montant est posé. */
  theoreticalNote: number | null;
};

function round(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function positiveMoney(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const amount = parseMoney(value);
  if (amount == null || amount <= 0) return null;
  return amount;
}

function currencyOf(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "EUR";
  return value.trim().toUpperCase();
}

/**
 * Coût net de la carte, en euros.
 * `supplier_net_eur` d’abord (équivalent déjà saisi, quelle que soit la devise d’origine).
 * Sinon `supplier_net` quand la devise est l’euro.
 * Sinon le prix d’achat `document_amount`, en euros seulement.
 * Une devise étrangère sans équivalent en euros ne devient pas un coût : aucun taux n’est inventé.
 * Hôtel, vol, train, transfert, activité, dépense et les autres cartes lisent les mêmes champs.
 */
export function cardTheoreticalCostEur(details: Record<string, unknown> | null | undefined) {
  if (!details) return null;
  const netEur = positiveMoney(details.supplier_net_eur);
  if (netEur != null) return netEur;
  const net = positiveMoney(details.supplier_net);
  if (net != null && currencyOf(details.supplier_currency) === "EUR") return net;
  const document = positiveMoney(details.document_amount);
  if (document != null && currencyOf(details.document_currency) === "EUR") return document;
  return null;
}

export function lineProfitability(input: {
  sale: number;
  nature?: "item" | "stay" | "fee" | "discount";
  /** Montants des débits réels déjà comptés. Une autorisation en attente n’y entre pas. */
  debits: number[];
  /** Coût net de la carte, en euros. null = non saisi. */
  cardCost: number | null;
}): LineProfitability {
  const sale = round(input.sale);
  if (input.nature === "discount") {
    return { sale, cost: null, margin: sale, source: "none", theoreticalNote: null };
  }
  const debits = input.debits.filter((value) => Number.isFinite(value)).map(round);
  const card = input.cardCost != null && Number.isFinite(input.cardCost) && input.cardCost > 0 ? round(input.cardCost) : null;
  if (debits.length > 0) {
    const cost = round(debits.reduce((sum, value) => sum + value, 0));
    return {
      sale,
      cost,
      margin: round(sale - cost),
      source: "real",
      theoreticalNote: card != null && card !== cost ? card : null,
    };
  }
  if (card != null) {
    return { sale, cost: card, margin: round(sale - card), source: "theoretical", theoreticalNote: null };
  }
  return { sale, cost: 0, margin: sale, source: "none", theoreticalNote: null };
}

/** Somme des coûts effectifs : débit réel s’il y en a un, sinon le coût de la carte. */
export function profitabilityTotals(lines: Pick<LineProfitability, "sale" | "cost" | "source">[]) {
  const sale = round(lines.reduce((sum, line) => sum + line.sale, 0));
  const cost = round(lines.reduce((sum, line) => sum + (line.cost ?? 0), 0));
  const theoreticalCost = round(
    lines.filter((line) => line.source === "theoretical").reduce((sum, line) => sum + (line.cost ?? 0), 0)
  );
  return { sale, cost, margin: round(sale - cost), theoreticalCost };
}
