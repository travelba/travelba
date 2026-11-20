import { parseExpenseQuantity } from "@/lib/crm/expense-pricing";
import { parseMoney } from "@/lib/crm/money";

/** Ligne lue par le client et portée au grand livre. */
export const COMMERCIAL_DISCOUNT_LABEL = "Remise commerciale";

/**
 * Même identifiant pour la vente de l’onglet Argent et la ligne de la pro forma MB3M.
 * Une seule ligne de chaque côté : on ne la recopie pas d’un document à l’autre.
 */
export const COMMERCIAL_DISCOUNT_LINE_ID = "remise-commerciale";

export type CommercialDiscountType = "amount" | "percent";

export type CommercialDiscount = {
  type: CommercialDiscountType | null;
  value: number | null;
};

const NONE: CommercialDiscount = { type: null, value: null };

export function commercialDiscountExternalId(bookingId: string) {
  return `booking:${bookingId}:commercial-discount`;
}

/** Un crédit par ligne. L’ancien crédit unique est annulé dès que la table est la source. */
export function discountLineExternalId(bookingId: string, lineId: string) {
  return `booking:${bookingId}:discount:${lineId}`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function numeric(value: unknown) {
  if (typeof value === "number") return value;
  if (value == null || value === "") return Number.NaN;
  return Number(String(value).trim().replace(",", "."));
}

/** Lecture des colonnes du dossier. Absent, zéro ou hors bornes : pas de remise. */
export function readCommercialDiscount(
  row: { remise_type?: unknown; remise_value?: unknown } | null | undefined
): CommercialDiscount {
  if (!row) return NONE;
  const type = row.remise_type === "amount" || row.remise_type === "percent" ? row.remise_type : null;
  const raw = numeric(row.remise_value);
  if (!type || !Number.isFinite(raw) || raw <= 0) return NONE;
  if (type === "percent") return { type, value: Math.min(100, raw) };
  return { type, value: roundMoney(raw) };
}

/**
 * Euros retirés du total déjà augmenté des commissions et des frais.
 * Un montant ne dépasse pas le total. Un pourcentage est ramené entre 0 et 100.
 * Le total qui en sort n’est jamais négatif.
 */
export function commercialDiscountAmount(gross: number, discount?: CommercialDiscount | null) {
  const base = Number(gross);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const spec = discount?.type ? discount : NONE;
  if (!spec.type || spec.value == null || !(spec.value > 0)) return 0;
  const raw = spec.type === "percent" ? base * (Math.min(100, spec.value) / 100) : spec.value;
  return roundMoney(Math.min(base, Math.max(0, raw)));
}

export function applyCommercialDiscount(gross: number, discount?: CommercialDiscount | null) {
  const base = Number(gross);
  const safe = Number.isFinite(base) ? Math.max(0, roundMoney(base)) : 0;
  const discountEuros = commercialDiscountAmount(safe, discount);
  return { gross: safe, discount: discountEuros, total: roundMoney(safe - discountEuros) };
}

/** La remise se déduit de la marge. Aucun plancher : la remise n’est pas refusée selon un pourcentage du net. */
export function marginAfterCommercialDiscount(input: { margin: number; net: number; discountEuros: number }) {
  const margin = roundMoney(Number(input.margin) - Math.max(0, Number(input.discountEuros) || 0));
  return { margin, floor: null as number | null, belowFloor: false };
}

export type CommercialDiscountColumns = {
  remise_type: CommercialDiscountType | null;
  remise_value: number | null;
};

/** Saisie agence ou outil MCP. `montant` / `amount`, `pourcentage` / `percent`. Vide : retire la remise. */
export function commercialDiscountPatch(
  type: unknown,
  value: unknown
): CommercialDiscountColumns | { error: string } {
  const token = String(type ?? "").trim().toLowerCase();
  if (!token || token === "aucune" || token === "null") {
    return { remise_type: null, remise_value: null };
  }
  const kind = token === "montant" || token === "amount" ? "amount" : token === "pourcentage" || token === "percent" ? "percent" : null;
  if (!kind) return { error: "La remise est un montant en euros ou un pourcentage." };
  if (value == null || String(value).trim() === "") return { remise_type: null, remise_value: null };
  const raw = numeric(value);
  if (!Number.isFinite(raw) || raw < 0) return { error: "La remise ne peut pas être négative." };
  if (raw === 0) return { remise_type: null, remise_value: null };
  if (kind === "percent" && raw > 100) return { error: "Le pourcentage est compris entre 0 et 100." };
  return { remise_type: kind, remise_value: roundMoney(raw) };
}

/** Réponse MCP : les mots de l’agence, pas les colonnes. */
export function commercialDiscountPublic(row: { remise_type?: unknown; remise_value?: unknown } | null | undefined) {
  const spec = readCommercialDiscount(row);
  if (!spec.type || spec.value == null) return null;
  return {
    type: spec.type === "percent" ? ("pourcentage" as const) : ("montant" as const),
    valeur: spec.value,
  };
}

/** Une remise du dossier. Le montant en euros se calcule sur la vente, il n’est pas stocké. */
export type DiscountLine = {
  id: string;
  label: string;
  kind: CommercialDiscountType;
  quantity: number;
  /** Euros, quand le type est un montant. */
  unitPrice: number | null;
  /** 0 à 100, quand le type est un pourcentage. Remplace le prix unitaire. */
  percent: number | null;
};

export type PricedDiscountLine = DiscountLine & {
  /** Euros retirés, après le plafond de la vente. */
  euros: number;
};

export type DiscountCut = {
  id: string;
  label: string;
  euros: number;
};

export type DiscountDraft = {
  label: string;
  kind: CommercialDiscountType;
  quantity: number;
  unitPrice: number | null;
  percent: number | null;
};

const LABEL_MAX = 120;

function discountKind(value: unknown): CommercialDiscountType | null {
  const token = String(value ?? "").trim().toLowerCase();
  if (token === "montant" || token === "amount") return "amount";
  if (token === "pourcentage" || token === "percent") return "percent";
  return null;
}

/**
 * Euros d’une ligne, avant le plafond commun.
 * Montant : quantité × prix unitaire. Pourcentage : quantité × (pourcentage de la vente).
 */
export function discountLineEuros(gross: number, line: Pick<DiscountLine, "kind" | "quantity" | "unitPrice" | "percent">) {
  const base = Number(gross);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const quantity = Number(line.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (line.kind === "percent") {
    const percent = Number(line.percent);
    if (!Number.isFinite(percent) || percent <= 0) return 0;
    return roundMoney(quantity * (Math.min(100, percent) / 100) * base);
  }
  const unit = Number(line.unitPrice);
  if (!Number.isFinite(unit) || unit <= 0) return 0;
  return roundMoney(quantity * unit);
}

/**
 * Toutes les lignes partent de la même vente, sans se composer.
 * La somme ne dépasse pas cette vente : les lignes de tête gardent leur montant, les suivantes rétrécissent.
 */
export function priceDiscountLines(gross: number, lines: DiscountLine[]): { lines: PricedDiscountLine[]; total: number } {
  const base = Number(gross);
  const safe = Number.isFinite(base) ? Math.max(0, roundMoney(base)) : 0;
  let room = safe;
  const priced = lines.map((line) => {
    const raw = discountLineEuros(safe, line);
    const euros = roundMoney(Math.min(Math.max(0, raw), room));
    room = roundMoney(room - euros);
    return { ...line, euros };
  });
  return { lines: priced, total: roundMoney(safe - room) };
}

/** Second plafond (débits déjà postés) : même règle, à partir des euros déjà calculés. */
export function capPricedDiscounts(lines: PricedDiscountLine[], ceiling: number): PricedDiscountLine[] {
  let room = Math.max(0, roundMoney(Number(ceiling) || 0));
  return lines.map((line) => {
    const euros = roundMoney(Math.min(Math.max(0, line.euros), room));
    room = roundMoney(room - euros);
    return { ...line, euros };
  });
}

export function discountCuts(lines: PricedDiscountLine[]): DiscountCut[] {
  return lines
    .filter((line) => line.euros > 0)
    .map((line) => ({ id: line.id, label: line.label, euros: line.euros }));
}

/** Saisie du formulaire ou de l’outil. Le montant seul, en euros, recalcule le prix unitaire. */
export function parseDiscountDraft(input: {
  label?: unknown;
  kind?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  percent?: unknown;
  amount?: unknown;
}): { ok: true; draft: DiscountDraft } | { ok: false; error: string } {
  const label = String(input.label ?? "").trim();
  if (!label) return { ok: false, error: "Libellé requis." };
  if (label.length > LABEL_MAX) return { ok: false, error: "Le libellé est trop long." };
  const kind = discountKind(input.kind);
  if (!kind) return { ok: false, error: "La remise est un montant en euros ou un pourcentage." };
  const quantityGiven = input.quantity !== undefined && input.quantity !== null && String(input.quantity).trim() !== "";
  const quantity = quantityGiven ? parseExpenseQuantity(input.quantity) : 1;
  if (quantity == null) return { ok: false, error: "Quantité invalide (un nombre supérieur à zéro)." };

  if (kind === "percent") {
    const raw = numeric(input.percent);
    if (!Number.isFinite(raw) || raw <= 0) return { ok: false, error: "Indiquez le pourcentage." };
    if (raw > 100) return { ok: false, error: "Le pourcentage est compris entre 0 et 100." };
    return { ok: true, draft: { label, kind, quantity, unitPrice: null, percent: roundMoney(raw) } };
  }

  const hasUnit = input.unit_price !== undefined && input.unit_price !== null && String(input.unit_price).trim() !== "";
  const hasAmount = input.amount !== undefined && input.amount !== null && String(input.amount).trim() !== "";
  let unitPrice: number | null = null;
  if (hasUnit) {
    const parsed = parseMoney(typeof input.unit_price === "number" || typeof input.unit_price === "string" ? input.unit_price : null);
    if (parsed == null || parsed <= 0) return { ok: false, error: "Prix unitaire invalide." };
    unitPrice = parsed;
  } else if (hasAmount) {
    const parsed = parseMoney(typeof input.amount === "number" || typeof input.amount === "string" ? input.amount : null);
    if (parsed == null || parsed <= 0) return { ok: false, error: "Montant requis." };
    unitPrice = roundMoney(parsed / quantity);
  }
  if (unitPrice == null || roundMoney(unitPrice * quantity) <= 0) return { ok: false, error: "Montant requis." };
  return { ok: true, draft: { label, kind, quantity, unitPrice, percent: null } };
}

/** Mots renvoyés au bot : une ligne, avec le montant en euros déjà calculé. */
export function discountLinePublic(line: PricedDiscountLine) {
  return {
    id: line.id,
    libelle: line.label,
    type: line.kind === "percent" ? ("pourcentage" as const) : ("montant" as const),
    quantite: line.quantity,
    prix_unitaire: line.kind === "amount" ? line.unitPrice : null,
    pourcentage: line.kind === "percent" ? line.percent : null,
    montant: line.euros,
  };
}

/** Une seule ligne reprend l’ancienne forme { type, valeur }. Plusieurs lignes : null. */
export function discountLineMirror(line: ReturnType<typeof discountLinePublic> | null | undefined) {
  if (!line) return null;
  const valeur = line.type === "pourcentage" ? line.pourcentage : line.prix_unitaire;
  if (valeur == null) return null;
  return { type: line.type, valeur };
}
