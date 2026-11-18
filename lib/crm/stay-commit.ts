import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorLike } from "@/lib/crm/db-error";
import {
  planDocumentRelease,
  type DocumentRelease,
  type DocumentRelink,
  type StayDocumentRow,
  type StayItemRef,
} from "@/lib/crm/stay-documents";

/** Une écriture d’étape préparée côté serveur. Seules ces colonnes partent en base. */
export type StayCommitUpdate = {
  id: string;
  patch: Record<string, unknown>;
};

export type StayCommitInsert = {
  clientId: string;
  row: Record<string, unknown>;
};

export type StayCommitPayload = {
  bookingId: string;
  updates: StayCommitUpdate[];
  deleted: string[];
  created: StayCommitInsert[];
  release: DocumentRelease[];
  /** Pièces partagées : `booking_item_id` suit une carte qui reste, avant le DELETE. */
  relink?: DocumentRelink[];
};

export type StayCommitResult =
  | { ok: true; ids: Record<string, string> }
  | { ok: false; error: DbErrorLike };

const UPDATE_COLUMNS = [
  "kind",
  "title",
  "supplier",
  "confirmation_ref",
  "start_at",
  "end_at",
  "amount",
  "include_in_ledger",
  "sort_order",
  "details",
  "visible_to_client",
  "billing_company_id",
] as const;

function pickColumns(source: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const key of UPDATE_COLUMNS) {
    if (key in source) patch[key] = source[key];
  }
  return patch;
}

function rpcArgs(payload: StayCommitPayload) {
  return {
    p_booking_id: payload.bookingId,
    p_updates: payload.updates.map((item) => ({ id: item.id, ...pickColumns(item.patch) })),
    p_deleted: payload.deleted,
    p_created: payload.created.map((item) => ({ ...pickColumns(item.row), client_id: item.clientId })),
    p_release: payload.release.map((item) => ({
      id: item.id,
      extracted: item.extracted,
      clear_sha: item.clearSha,
    })),
  };
}

function missingCommitFunction(error: DbErrorLike) {
  const message = error?.message || "";
  if (error?.code === "PGRST202" || error?.code === "42883") return true;
  return /crm_commit_stay_steps/i.test(message) && /function|could not find|schema cache|does not exist/i.test(message);
}

/**
 * Une pièce encore liée à une carte restante suit cette carte avant le DELETE,
 * pour que `ON DELETE SET NULL` ne la détache pas. La fonction SQL ne connaît
 * que les retraits : ce report est écrit juste avant, et il est idempotent.
 */
async function applyRelinks(supabase: SupabaseClient, payload: StayCommitPayload): Promise<StayCommitResult | null> {
  for (const link of payload.relink || []) {
    const { error } = await supabase
      .from("crm_booking_documents")
      .update({ booking_item_id: link.bookingItemId })
      .eq("id", link.id)
      .eq("booking_id", payload.bookingId);
    if (error) return { ok: false, error };
  }
  return null;
}

/**
 * Modifications, retraits de pièces, suppressions et créations : une seule transaction
 * (`crm_commit_stay_steps`). Sans la fonction (migration pas encore jouée), le même
 * ordre part en appels séparés : les pièces d’abord, pour que le DELETE ne heurte pas
 * l’index d’empreinte.
 */
export async function applyStayCommit(supabase: SupabaseClient, payload: StayCommitPayload): Promise<StayCommitResult> {
  const relinked = await applyRelinks(supabase, payload);
  if (relinked) return relinked;
  const { data, error } = await supabase.rpc("crm_commit_stay_steps", rpcArgs(payload));
  if (!error) {
    const ids =
      data && typeof data === "object" && "ids" in data && data.ids && typeof data.ids === "object"
        ? (data.ids as Record<string, string>)
        : {};
    return { ok: true, ids };
  }
  if (!missingCommitFunction(error)) return { ok: false, error };
  return applyStayCommitDirect(supabase, payload);
}

const DOCUMENT_COLUMNS = "id, booking_item_id, content_sha256, extracted, visible_to_client, created_at";

/** Justificatifs à retirer ou à reporter quand ces cartes quittent le dossier. */
export async function planDeletedCardDocuments(
  supabase: SupabaseClient,
  bookingId: string,
  deletedItemIds: string[]
): Promise<{ ok: true; release: DocumentRelease[]; relink: DocumentRelink[] } | { ok: false; error: DbErrorLike }> {
  if (!deletedItemIds.length) return { ok: true, release: [], relink: [] };
  const docs = await supabase
    .from("crm_booking_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("booking_id", bookingId);
  if (docs.error) return { ok: false, error: docs.error };
  const items = await supabase.from("crm_booking_items").select("id, source_document_id").eq("booking_id", bookingId);
  if (items.error) return { ok: false, error: items.error };
  const plan = planDocumentRelease({
    documents: (docs.data || []) as StayDocumentRow[],
    items: (items.data || []) as StayItemRef[],
    deletedItemIds,
    now: new Date().toISOString(),
  });
  return { ok: true, release: plan.release, relink: plan.relink };
}

async function applyStayCommitDirect(supabase: SupabaseClient, payload: StayCommitPayload): Promise<StayCommitResult> {
  for (const piece of payload.release) {
    const patch: Record<string, unknown> = {
      visible_to_client: false,
      booking_item_id: null,
      extracted: piece.extracted,
    };
    if (piece.clearSha) patch.content_sha256 = null;
    const { error } = await supabase
      .from("crm_booking_documents")
      .update(patch)
      .eq("id", piece.id)
      .eq("booking_id", payload.bookingId);
    if (error) return { ok: false, error };
  }
  if (payload.deleted.length) {
    const { error } = await supabase
      .from("crm_booking_items")
      .delete()
      .in("id", payload.deleted)
      .eq("booking_id", payload.bookingId);
    if (error) return { ok: false, error };
  }
  for (const item of payload.updates) {
    const patch = pickColumns(item.patch);
    if (!Object.keys(patch).length) continue;
    const { data, error } = await supabase
      .from("crm_booking_items")
      .update(patch)
      .eq("id", item.id)
      .eq("booking_id", payload.bookingId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error };
    if (!data) return { ok: false, error: { code: "P0002", message: "Carte introuvable" } };
  }
  const ids: Record<string, string> = {};
  for (const item of payload.created) {
    const { data, error } = await supabase
      .from("crm_booking_items")
      .insert({ booking_id: payload.bookingId, ...pickColumns(item.row) })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error || { message: "Carte non créée." } };
    if (item.clientId) ids[item.clientId] = String((data as { id: string }).id);
  }
  return { ok: true, ids };
}
