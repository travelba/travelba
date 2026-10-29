import { sellFromNet } from "./pricing";

/**
 * Libellés de repas au plus égaux au code ETG.
 * Un code inconnu reste le code : on ne l’améliore pas.
 */
const MEAL_LABELS: Record<string, string> = {
  nomeal: "Sans repas",
  breakfast: "Petit-déjeuner",
  "american-breakfast": "Petit-déjeuner",
  "asian-breakfast": "Petit-déjeuner",
  "breakfast-buffet": "Petit-déjeuner",
  "chinese-breakfast": "Petit-déjeuner",
  "continental-breakfast": "Petit-déjeuner",
  "english-breakfast": "Petit-déjeuner",
  "irish-breakfast": "Petit-déjeuner",
  "israeli-breakfast": "Petit-déjeuner",
  "japanese-breakfast": "Petit-déjeuner",
  "scandinavian-breakfast": "Petit-déjeuner",
  "scottish-breakfast": "Petit-déjeuner",
  lunch: "Déjeuner",
  dinner: "Dîner",
  "half-board": "Demi-pension",
  "half-board-lunch": "Demi-pension (déjeuner)",
  "half-board-dinner": "Demi-pension (dîner)",
  "full-board": "Pension complète",
  "all-inclusive": "Tout compris",
  "soft-all-inclusive": "Tout compris, boissons non alcoolisées",
  "super-all-inclusive": "Tout compris",
  "ultra-all-inclusive": "Tout compris",
};

export function mealLabel(value: string | null | undefined): { code: string; label: string } {
  const code = (value || "").trim();
  if (!code) return { code: "", label: "Repas non précisé" };
  return { code, label: MEAL_LABELS[code] || code };
}

export const RG_EXT_FIELDS = [
  "class",
  "quality",
  "sex",
  "bathroom",
  "bedding",
  "family",
  "capacity",
  "club",
  "bedrooms",
  "balcony",
  "view",
  "floor",
] as const;

export type RgExt = Partial<Record<(typeof RG_EXT_FIELDS)[number], number>>;

export function rgExtEqual(left: RgExt | null | undefined, right: RgExt | null | undefined) {
  if (!left || !right) return false;
  return RG_EXT_FIELDS.every((field) => Number(left[field] ?? 0) === Number(right[field] ?? 0));
}

export type RoomGroupStatic = {
  name?: string;
  rg_ext?: RgExt;
  images?: unknown[];
  room_amenities?: string[];
};

export function matchRoomGroup(rg: RgExt | null | undefined, groups: RoomGroupStatic[]) {
  if (!rg) return null;
  return groups.find((group) => rgExtEqual(rg, group.rg_ext)) || null;
}

export type TaxLine = {
  name: string;
  amount: string;
  currency_code: string;
  included_by_supplier: boolean;
};

export function partitionTaxes(taxes: unknown): { included: TaxLine[]; excluded: TaxLine[] } {
  const included: TaxLine[] = [];
  const excluded: TaxLine[] = [];
  if (!Array.isArray(taxes)) return { included, excluded };
  for (const tax of taxes) {
    if (!tax || typeof tax !== "object") continue;
    const row = tax as Record<string, unknown>;
    const line: TaxLine = {
      name: String(row.name || "taxe"),
      amount: String(row.amount || ""),
      currency_code: String(row.currency_code || ""),
      included_by_supplier: row.included_by_supplier !== false,
    };
    if (row.included_by_supplier === false) excluded.push(line);
    else included.push(line);
  }
  return { included, excluded };
}

/** ETG envoie les pénalités en UTC, souvent sans suffixe Z. */
export function parseUtcTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = value.trim();
  const iso = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : `${raw}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUtcInParis(value: string | null | undefined): string | null {
  const date = parseUtcTimestamp(value);
  if (!date) return null;
  const formatted = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
  return `${formatted} (heure de Paris)`;
}

export type PenaltyView = {
  text: string;
};

export type Policy = {
  start_at?: string | null;
  end_at?: string | null;
  amount_show?: string;
  amount_charge?: string;
  currency?: string;
};

export function penaltyLines(
  policies: Policy[] | null | undefined,
  freeBefore: string | null | undefined,
  currency: string
): PenaltyView[] {
  const lines: PenaltyView[] = [];
  if (freeBefore) {
    const when = formatUtcInParis(freeBefore);
    lines.push({
      text: when
        ? `Annulation sans frais jusqu’au ${when}.`
        : "Annulation sans frais jusqu’à la date indiquée par Ratehawk.",
    });
  } else {
    lines.push({ text: "Pas d’annulation sans frais. Les frais s’appliquent dès l’annulation." });
  }
  for (const policy of policies || []) {
    const amount = policy.amount_show || policy.amount_charge || "0";
    const start = formatUtcInParis(policy.start_at);
    const end = formatUtcInParis(policy.end_at);
    const money = `${amount} ${currency}`.trim();
    if (!start && end) lines.push({ text: `Jusqu’au ${end} : ${money}.` });
    else if (start && end) lines.push({ text: `Du ${start} au ${end} : ${money}.` });
    else if (start && !end) lines.push({ text: `À partir du ${start} : ${money}.` });
  }
  return lines;
}

export function imageUrl(template: string) {
  return template.replace("{size}", "640x400");
}

export function metapolicyLines(struct: unknown, extra: unknown): string[] {
  const lines: string[] = [];
  if (struct && typeof struct === "object") {
    for (const [key, value] of Object.entries(struct as Record<string, unknown>)) {
      if (value == null || value === "") continue;
      if (Array.isArray(value)) {
        if (!value.length) continue;
        lines.push(`${key} : ${value.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" · ")}`);
      } else if (typeof value === "object") {
        lines.push(`${key} : ${JSON.stringify(value)}`);
      } else {
        lines.push(`${key} : ${String(value)}`);
      }
    }
  }
  if (typeof extra === "string" && extra.trim()) {
    lines.push(extra.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  }
  return lines;
}

export type PaymentType = {
  type?: string;
  amount?: string;
  show_amount?: string;
  currency_code?: string;
  show_currency_code?: string;
  is_need_credit_card_data?: boolean;
  is_need_cvc?: boolean;
  tax_data?: { taxes?: unknown };
  cancellation_penalties?: { policies?: Policy[]; free_cancellation_before?: string | null };
};

export function pickPaymentType(types: PaymentType[] | null | undefined, preferred: string): PaymentType | null {
  const list = types || [];
  return list.find((row) => row.type === preferred) || list.find((row) => row.type === "deposit") || list[0] || null;
}

export function shownPrice(payment: PaymentType | null, margin: number) {
  const net = payment?.show_amount || payment?.amount || null;
  const currency = payment?.show_currency_code || payment?.currency_code || "";
  const netNumber = net == null ? null : Number(net);
  const sell = netNumber != null && Number.isFinite(netNumber) ? sellFromNet(netNumber, margin) : null;
  return { net, currency, sell };
}
