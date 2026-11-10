import { parseMoney } from "@/lib/crm/money";
import { isActiveItem } from "@/lib/crm/types";
import { isAutoTicketingExpense, isSpareTicketingExpense } from "@/lib/crm/ticketing-fee";

export const EXPENSE_PRESET_MAX = 20;
export const EXPENSE_PRESET_LABEL_MAX = 80;
export const EXPENSE_PRESET_AMOUNT_MAX = 100_000;

/** Le raccourci ne part pas : la ligne automatique est déjà sur le dossier. */
export const TICKETING_PRESET_BLOCKED =
  "Les frais de billeterie automatiques sont déjà sur ce dossier.";

export type ExpensePresetGuard = "ticketing" | null;

export type ExpensePreset = {
  id: string;
  label: string;
  amount: number;
  sortOrder: number;
  active: boolean;
  guard: ExpensePresetGuard;
};

/** Affichés tant que la table n’est pas en place. Une table vide, elle, ne les remet pas. */
export const DEFAULT_EXPENSE_PRESETS: readonly ExpensePreset[] = [
  { id: "default:billetterie", label: "Frais billetterie", amount: 25, sortOrder: 0, active: true, guard: "ticketing" },
  { id: "default:billetterie-train", label: "Frais billetterie train", amount: 10, sortOrder: 1, active: true, guard: null },
  { id: "default:transfert", label: "Frais transfert", amount: 10, sortOrder: 2, active: true, guard: null },
];

export type ExpensePresetDraft = {
  id: string | null;
  label: string;
  amount: number;
  active: boolean;
  guard: ExpensePresetGuard;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizePresetLabel(label: string) {
  return label.trim().toLocaleLowerCase("fr-FR");
}

export function activeExpensePresets(presets: readonly ExpensePreset[]) {
  return presets
    .filter((preset) => preset.active && preset.label.trim() && preset.amount > 0)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "fr"));
}

/** Même corps qu’une dépense saisie à la main : quantité 1, sans marqueur automatique. */
export function expenseFromPreset(preset: Pick<ExpensePreset, "label" | "amount">) {
  return {
    kind: "expense" as const,
    title: preset.label.trim(),
    quantity: 1,
    unit_price: preset.amount,
    amount: preset.amount,
    include_in_ledger: true as const,
    supplier: null,
    confirmation_ref: null,
    details: {} as Record<string, unknown>,
  };
}

export function expensePresetForTitle(presets: readonly ExpensePreset[], title: string) {
  const key = normalizePresetLabel(title);
  if (!key) return null;
  return presets.find((preset) => preset.active && normalizePresetLabel(preset.label) === key) ?? null;
}

/**
 * Vrai seulement pour un raccourci gardé « billeterie » quand une ligne automatique
 * (ou une copie « Frais de billeterie » non retouchée) est encore active.
 * Le libellé du raccourci n’est pas celui de la ligne automatique : la synchro ne le reprend pas.
 */
export function ticketingPresetBlocked(
  presets: readonly ExpensePreset[],
  title: string,
  items: {
    kind?: string | null;
    title?: string | null;
    details?: Record<string, unknown> | null;
    lifecycle?: string | null;
  }[]
) {
  const preset = expensePresetForTitle(presets, title);
  if (!preset || preset.guard !== "ticketing") return false;
  return items.some(
    (item) => isActiveItem(item) && (isAutoTicketingExpense(item) || isSpareTicketingExpense(item))
  );
}

function draftGuard(value: unknown): ExpensePresetGuard | "invalid" {
  if (value == null || value === false || value === "") return null;
  if (value === "ticketing" || value === true) return "ticketing";
  return "invalid";
}

/** `presets` (écran) ou `lignes` (outil). Les deux formes décrivent la liste entière. */
export function parseExpensePresetDrafts(input: unknown): { presets: ExpensePresetDraft[] } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Liste invalide." };
  const record = input as Record<string, unknown>;
  const raw = record.presets ?? record.lignes;
  if (!Array.isArray(raw)) return { error: "Liste invalide." };
  if (raw.length > EXPENSE_PRESET_MAX) return { error: `${EXPENSE_PRESET_MAX} raccourcis au plus.` };
  const presets: ExpensePresetDraft[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return { error: "Ligne invalide." };
    const item = row as Record<string, unknown>;
    const label = String(item.label ?? item.libelle ?? "").trim();
    if (!label || label.length > EXPENSE_PRESET_LABEL_MAX) {
      return { error: `Libellé requis (${EXPENSE_PRESET_LABEL_MAX} caractères au plus).` };
    }
    const key = normalizePresetLabel(label);
    if (seen.has(key)) return { error: `« ${label} » est en double.` };
    seen.add(key);
    const amountSource =
      typeof item.amount === "number" || typeof item.amount === "string"
        ? item.amount
        : typeof item.montant === "number" || typeof item.montant === "string"
          ? item.montant
          : null;
    const amount = parseMoney(amountSource);
    if (amount == null || amount <= 0 || amount > EXPENSE_PRESET_AMOUNT_MAX) return { error: "Montant invalide." };
    const active =
      item.active === undefined && item.actif === undefined ? true : item.active === true || item.actif === true;
    const guard = draftGuard(item.guard !== undefined ? item.guard : item.billeterie);
    if (guard === "invalid") return { error: "Garde inconnue." };
    const id = typeof item.id === "string" && UUID.test(item.id.trim()) ? item.id.trim() : null;
    presets.push({ id, label, amount, active, guard });
  }
  return { presets };
}
