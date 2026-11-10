import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeExpensePresets,
  DEFAULT_EXPENSE_PRESETS,
  parseExpensePresetDrafts,
  type ExpensePreset,
  type ExpensePresetDraft,
} from "@/lib/crm/expense-presets";

const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

export class ExpensePresetError extends Error {}

type PresetRow = {
  id: string;
  label: string;
  amount: number | string;
  sort_order: number | null;
  active: boolean | null;
  guard: string | null;
};

export type ExpensePresetLoad = {
  presets: ExpensePreset[];
  source: "table" | "defaults";
};

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code && MISSING.has(error.code)) return true;
  return /crm_expense_presets|does not exist|schema cache/i.test(error.message || "");
}

function rowToPreset(row: PresetRow, index: number): ExpensePreset {
  return {
    id: row.id,
    label: String(row.label || "").trim(),
    amount: Number(row.amount),
    sortOrder: row.sort_order == null ? index : Number(row.sort_order),
    active: row.active !== false,
    guard: row.guard === "ticketing" ? "ticketing" : null,
  };
}

/** Table absente : les trois défauts. Table vide : liste vide, les défauts ne reviennent pas. */
export async function loadExpensePresets(supabase: SupabaseClient): Promise<ExpensePresetLoad> {
  const { data, error } = await supabase
    .from("crm_expense_presets")
    .select("id, label, amount, sort_order, active, guard")
    .order("sort_order", { ascending: true });
  if (error) {
    if (missingTable(error)) return { presets: [...DEFAULT_EXPENSE_PRESETS], source: "defaults" };
    throw new ExpensePresetError("Dépenses types illisibles.");
  }
  return {
    presets: ((data || []) as PresetRow[]).map(rowToPreset),
    source: "table",
  };
}

const NIL = "00000000-0000-0000-0000-000000000000";

/**
 * Remplace la liste. Les dépenses déjà posées sur un dossier ne bougent pas :
 * aucune clé étrangère ne les relie à ces raccourcis.
 */
export async function saveExpensePresets(
  supabase: SupabaseClient,
  drafts: ExpensePresetDraft[],
  staffId: string | null
) {
  const current = await supabase
    .from("crm_expense_presets")
    .select("id, label, amount, sort_order, active, guard, updated_by, updated_at");
  if (current.error) {
    if (missingTable(current.error)) throw new ExpensePresetError("Le réglage n’est pas encore en place.");
    throw new ExpensePresetError("Dépenses types illisibles.");
  }
  const previous = (current.data || []) as (PresetRow & { updated_by?: string | null; updated_at?: string | null })[];
  const existing = new Set(previous.map((row) => row.id));
  const now = new Date().toISOString();
  const rows = drafts.map((draft, index) => ({
    id: draft.id && existing.has(draft.id) ? draft.id : crypto.randomUUID(),
    label: draft.label,
    amount: draft.amount,
    sort_order: index,
    active: draft.active,
    guard: draft.guard,
    updated_by: staffId,
    updated_at: now,
  }));

  if (!rows.length) {
    const cleared = await supabase.from("crm_expense_presets").delete().neq("id", NIL);
    if (cleared.error) throw new ExpensePresetError("Le réglage n’a pas été enregistré.");
    return [];
  }

  // Libère l’index des libellés actifs avant la liste finale (un échange de noms compris).
  const parked = await supabase.from("crm_expense_presets").update({ active: false }).neq("id", NIL);
  if (parked.error) throw new ExpensePresetError("Le réglage n’a pas été enregistré.");
  const saved = await supabase
    .from("crm_expense_presets")
    .upsert(rows)
    .select("id, label, amount, sort_order, active, guard");
  if (saved.error) {
    if (previous.length) await supabase.from("crm_expense_presets").upsert(previous);
    throw new ExpensePresetError("Le réglage n’a pas été enregistré.");
  }
  const keep = new Set(rows.map((row) => row.id));
  const drop = [...existing].filter((id) => !keep.has(id));
  if (drop.length) {
    const removed = await supabase.from("crm_expense_presets").delete().in("id", drop);
    if (removed.error) throw new ExpensePresetError("Le réglage n’a pas été enregistré.");
  }
  return ((saved.data || []) as PresetRow[]).map(rowToPreset).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function presetLines(presets: readonly ExpensePreset[]) {
  return presets.map((preset) => ({
    id: preset.id.startsWith("default:") ? null : preset.id,
    libelle: preset.label,
    montant: preset.amount,
    actif: preset.active,
    billeterie: preset.guard === "ticketing",
    ordre: preset.sortOrder,
  }));
}

/** Sans enregistrer : lecture. enregistrer true remplace la liste. */
export async function readOrSaveExpensePresets(
  supabase: SupabaseClient,
  input: { enregistrer: boolean; lignes: unknown },
  staffId: string | null
) {
  if (input.enregistrer && !Array.isArray(input.lignes)) throw new ExpensePresetError("Indiquez les dépenses types.");
  if (!input.enregistrer) {
    const loaded = await loadExpensePresets(supabase);
    return {
      enregistre: false,
      source: loaded.source === "table" ? "table" : "defaut",
      lignes: presetLines(loaded.presets),
    };
  }
  const parsed = parseExpensePresetDrafts({ lignes: input.lignes });
  if ("error" in parsed) throw new ExpensePresetError(parsed.error);
  const saved = await saveExpensePresets(supabase, parsed.presets, staffId);
  return { enregistre: true, source: "table" as const, lignes: presetLines(saved) };
}

export function presetsForDossier(loaded: ExpensePresetLoad) {
  if (loaded.source === "defaults") return activeExpensePresets(DEFAULT_EXPENSE_PRESETS);
  return activeExpensePresets(loaded.presets);
}
