import { MIN_MARGIN_OF_NET } from "@/lib/crm/concierge-pricing";

/** Ligne lue par le client et portée au grand livre. */
export const COMMERCIAL_DISCOUNT_LABEL = "Remise commerciale";

export type CommercialDiscountType = "amount" | "percent";

export type CommercialDiscount = {
  type: CommercialDiscountType | null;
  value: number | null;
};

const NONE: CommercialDiscount = { type: null, value: null };

export function commercialDiscountExternalId(bookingId: string) {
  return `booking:${bookingId}:commercial-discount`;
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

/**
 * La remise se déduit de la marge. Sous 12 % du net fournisseur : avertissement, pas un blocage.
 * Net nul ou inconnu : pas d’alerte.
 */
export function marginAfterCommercialDiscount(input: { margin: number; net: number; discountEuros: number }) {
  const net = Number(input.net);
  const margin = roundMoney(Number(input.margin) - Math.max(0, Number(input.discountEuros) || 0));
  const knownNet = Number.isFinite(net) && net > 0;
  const floorCents = knownNet ? Math.round(net * MIN_MARGIN_OF_NET * 100) : null;
  return {
    margin,
    floor: floorCents == null ? null : floorCents / 100,
    belowFloor: floorCents != null && Math.round(margin * 100) < floorCents,
  };
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
