// Pas de `server-only` : `displayed-stay` charge ce module et entre dans le graphe client
// (aperçu exemple). Le secret de service n’est pas une variable publique.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMMERCIAL_DISCOUNT_LABEL,
  parseDiscountDraft,
  type DiscountDraft,
  type DiscountLine,
} from "@/lib/crm/commercial-discount";
import { createServiceClient } from "@/lib/supabase/admin";

const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

export const DISCOUNT_MIGRATION_MESSAGE =
  "La remise commerciale n’est pas encore en place. Appliquez la migration, puis réessayez.";

type DiscountRow = {
  id: string;
  booking_id: string;
  label: string;
  kind: string;
  quantity: number | string;
  unit_price: number | string | null;
  percent: number | string | null;
  sort_order: number | null;
};

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code && MISSING.has(error.code)) return true;
  return /crm_booking_discounts|does not exist|schema cache/i.test(error.message || "");
}

function num(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function discountRow(row: DiscountRow): DiscountLine | null {
  const kind = row.kind === "amount" || row.kind === "percent" ? row.kind : null;
  const quantity = num(row.quantity);
  const label = String(row.label || "").trim();
  if (!kind || !label || quantity == null || quantity <= 0 || !row.id) return null;
  if (kind === "percent") {
    const percent = num(row.percent);
    if (percent == null || percent <= 0) return null;
    return { id: row.id, label, kind, quantity, unitPrice: null, percent };
  }
  const unitPrice = num(row.unit_price);
  if (unitPrice == null || unitPrice <= 0) return null;
  return { id: row.id, label, kind, quantity, unitPrice, percent: null };
}

function db(supabase?: SupabaseClient) {
  return supabase || createServiceClient();
}

/** Lecture : sans client et sans clé de service, la table est illisible et les colonnes restent. */
function readDb(supabase?: SupabaseClient): SupabaseClient | null {
  if (supabase) return supabase;
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

/**
 * Lignes du dossier, dans l’ordre de saisie.
 * `null` : la table n’est pas encore là, la lecture reste sur les colonnes du dossier.
 */
export async function loadDiscountLines(
  bookingIds: string[],
  supabase?: SupabaseClient
): Promise<Map<string, DiscountLine[]> | null> {
  const map = new Map<string, DiscountLine[]>();
  if (!bookingIds.length) return map;
  const client = readDb(supabase);
  if (!client) return null;
  const { data, error } = await client
    .from("crm_booking_discounts")
    .select("id, booking_id, label, kind, quantity, unit_price, percent, sort_order")
    .in("booking_id", bookingIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    if (missingTable(error)) return null;
    throw new Error(error.message);
  }
  for (const id of bookingIds) map.set(id, []);
  for (const row of (data || []) as DiscountRow[]) {
    const line = discountRow(row);
    if (!line) continue;
    const list = map.get(row.booking_id) || [];
    list.push(line);
    map.set(row.booking_id, list);
  }
  return map;
}

function draftColumns(draft: DiscountDraft, sortOrder: number) {
  return {
    label: draft.label,
    kind: draft.kind,
    quantity: draft.quantity,
    unit_price: draft.kind === "amount" ? draft.unitPrice : null,
    percent: draft.kind === "percent" ? draft.percent : null,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };
}

async function nextSort(supabase: SupabaseClient, bookingId: string) {
  const { data, error } = await supabase
    .from("crm_booking_discounts")
    .select("sort_order")
    .eq("booking_id", bookingId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) {
    if (missingTable(error)) throw new Error(DISCOUNT_MIGRATION_MESSAGE);
    throw new Error(error.message);
  }
  const current = num((data?.[0] as { sort_order?: number | string | null } | undefined)?.sort_order);
  return (current == null ? 0 : current) + 1;
}

export async function insertDiscountLine(
  bookingId: string,
  input: Parameters<typeof parseDiscountDraft>[0],
  supabase?: SupabaseClient
): Promise<DiscountLine> {
  const parsed = parseDiscountDraft(input);
  if (!parsed.ok) throw new Error(parsed.error);
  const client = db(supabase);
  const { data, error } = await client
    .from("crm_booking_discounts")
    .insert({ booking_id: bookingId, ...draftColumns(parsed.draft, await nextSort(client, bookingId)) })
    .select("id, booking_id, label, kind, quantity, unit_price, percent, sort_order")
    .single();
  if (error) {
    if (missingTable(error)) throw new Error(DISCOUNT_MIGRATION_MESSAGE);
    throw new Error(error.message);
  }
  const line = discountRow(data as DiscountRow);
  if (!line) throw new Error("Remise non enregistrée.");
  return line;
}

export async function updateDiscountLine(
  bookingId: string,
  lineId: string,
  input: Parameters<typeof parseDiscountDraft>[0],
  supabase?: SupabaseClient
): Promise<DiscountLine> {
  const parsed = parseDiscountDraft(input);
  if (!parsed.ok) throw new Error(parsed.error);
  const client = db(supabase);
  const { data: current, error: readError } = await client
    .from("crm_booking_discounts")
    .select("sort_order")
    .eq("id", lineId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (readError) {
    if (missingTable(readError)) throw new Error(DISCOUNT_MIGRATION_MESSAGE);
    throw new Error(readError.message);
  }
  if (!current) throw new Error("Cette remise n’est pas sur le dossier.");
  const sort = num((current as { sort_order?: number | string | null }).sort_order) ?? 0;
  const { data, error } = await client
    .from("crm_booking_discounts")
    .update(draftColumns(parsed.draft, sort))
    .eq("id", lineId)
    .eq("booking_id", bookingId)
    .select("id, booking_id, label, kind, quantity, unit_price, percent, sort_order")
    .single();
  if (error) throw new Error(error.message);
  const line = discountRow(data as DiscountRow);
  if (!line) throw new Error("Remise non enregistrée.");
  return line;
}

export async function deleteDiscountLine(bookingId: string, lineId: string, supabase?: SupabaseClient) {
  const { error } = await db(supabase).from("crm_booking_discounts").delete().eq("id", lineId).eq("booking_id", bookingId);
  if (error) {
    if (missingTable(error)) throw new Error(DISCOUNT_MIGRATION_MESSAGE);
    throw new Error(error.message);
  }
}

export async function deleteBookingDiscounts(bookingId: string, supabase?: SupabaseClient) {
  const { error } = await db(supabase).from("crm_booking_discounts").delete().eq("booking_id", bookingId);
  if (error) {
    if (missingTable(error)) throw new Error(DISCOUNT_MIGRATION_MESSAGE);
    throw new Error(error.message);
  }
}

/** La copie emporte les lignes. Table absente : rien à copier, le dossier s’ouvre quand même. */
export async function copyDiscountLines(sourceId: string, copyId: string, supabase?: SupabaseClient) {
  const client = db(supabase);
  const loaded = await loadDiscountLines([sourceId], client);
  if (!loaded) return;
  const lines = loaded.get(sourceId) || [];
  if (!lines.length) return;
  const rows = lines.map((line, index) => ({
    booking_id: copyId,
    label: line.label || COMMERCIAL_DISCOUNT_LABEL,
    kind: line.kind,
    quantity: line.quantity,
    unit_price: line.kind === "amount" ? line.unitPrice : null,
    percent: line.kind === "percent" ? line.percent : null,
    sort_order: index,
  }));
  const { error } = await client.from("crm_booking_discounts").insert(rows);
  if (error) {
    if (missingTable(error)) return;
    throw new Error(error.message);
  }
}
