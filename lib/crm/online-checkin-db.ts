import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuditRow } from "./audit-events";
import {
  checkinManualWrite,
  checkinPassWrites,
  checkinSentWrites,
  flightCheckinViews,
  parseOnlineCheckinStatus,
  type CheckinWrite,
  type FlightCheckinView,
  type OnlineCheckinActor,
  type OnlineCheckinStatus,
  type StoredFlightCheckin,
} from "./online-checkin";
import type { CrmBookingDocument, CrmBookingItem } from "./types";

const MISSING_TABLE = new Set(["42P01", "PGRST205", "PGRST204"]);

type DbError = { code?: string | null; message?: string | null } | null;

function missingTable(error: DbError) {
  return Boolean(error?.code && MISSING_TABLE.has(error.code));
}

function logCheckin(error: DbError) {
  console.error("[checkin]", error?.code ?? "?");
}

export type CheckinContext = {
  items: CrmBookingItem[];
  documents: Pick<CrmBookingDocument, "id" | "kind" | "file_name" | "booking_item_id">[];
  rows: StoredFlightCheckin[];
  tableReady: boolean;
};

export async function loadCheckinContext(db: SupabaseClient, bookingId: string): Promise<CheckinContext> {
  const [items, documents, checkins] = await Promise.all([
    db
      .from("crm_booking_items")
      .select("id, kind, title, supplier, start_at, details, lifecycle, source_document_id")
      .eq("booking_id", bookingId),
    db.from("crm_booking_documents").select("id, kind, file_name, booking_item_id").eq("booking_id", bookingId),
    db.from("crm_flight_checkins").select("booking_item_id, status, actor").eq("booking_id", bookingId),
  ]);
  if (items.error) logCheckin(items.error);
  if (documents.error) logCheckin(documents.error);
  const tableReady = !checkins.error && !missingTable(checkins.error);
  if (checkins.error && !missingTable(checkins.error)) logCheckin(checkins.error);
  return {
    items: (items.data || []) as CrmBookingItem[],
    documents: (documents.data || []) as CheckinContext["documents"],
    rows: tableReady ? ((checkins.data || []) as StoredFlightCheckin[]) : [],
    tableReady: !checkins.error,
  };
}

export function viewsFromContext(context: CheckinContext, now = new Date()) {
  return flightCheckinViews({
    items: context.items,
    documents: context.documents,
    rows: context.rows,
    now,
  });
}

async function applyWrites(db: SupabaseClient, writes: CheckinWrite[], audit: { summary: string; actorKind: "auto" | "human"; actorId?: string | null; customerId?: string | null }) {
  if (!writes.length) return { ok: true as const, written: 0 };
  const updated_at = new Date().toISOString();
  for (const write of writes) {
    const payload = {
      booking_item_id: write.booking_item_id,
      booking_id: write.booking_id,
      status: write.status,
      actor: write.actor,
      updated_at,
    };
    const existing = await db
      .from("crm_flight_checkins")
      .select("booking_item_id")
      .eq("booking_item_id", write.booking_item_id)
      .maybeSingle();
    if (existing.error) {
      logCheckin(existing.error);
      if (missingTable(existing.error)) return { ok: false as const, missing: true as const };
      return { ok: false as const, missing: false as const };
    }
    const saved = existing.data
      ? await db.from("crm_flight_checkins").update(payload).eq("booking_item_id", write.booking_item_id)
      : await db.from("crm_flight_checkins").insert(payload);
    if (saved.error) {
      logCheckin(saved.error);
      if (missingTable(saved.error)) return { ok: false as const, missing: true as const };
      return { ok: false as const, missing: false as const };
    }
  }
  const bookingId = writes[0]?.booking_id;
  if (bookingId) {
    const row = toAuditRow({
      actorKind: audit.actorKind,
      actorId: audit.actorId,
      action: "enregistrement_en_ligne",
      bookingId,
      customerId: audit.customerId,
      summary: audit.summary,
      detail: { statut: writes.map((write) => write.status).join(", ") },
    });
    const auditResult = await db.from("crm_audit_events").insert(row);
    if (auditResult.error) logCheckin(auditResult.error);
  }
  return { ok: true as const, written: writes.length };
}

export async function syncCheckinWithPasses(db: SupabaseClient, bookingId: string, actor: OnlineCheckinActor) {
  try {
    const context = await loadCheckinContext(db, bookingId);
    if (!context.tableReady) return;
    const writes = checkinPassWrites({
      bookingId,
      items: context.items,
      documents: context.documents,
      rows: context.rows,
      actor,
      now: new Date(),
    });
    await applyWrites(db, writes, {
      summary: "Enregistrement en ligne · cartes d’embarquement reçues",
      actorKind: actor === "bot" ? "auto" : "human",
    });
  } catch (err) {
    console.error("[checkin]", err instanceof Error ? "sync" : "sync");
  }
}

export async function syncCheckinSent(
  db: SupabaseClient,
  bookingId: string,
  actor: OnlineCheckinActor,
  hints: { documentIds: string[]; flightLabels: string[] }
) {
  try {
    const context = await loadCheckinContext(db, bookingId);
    if (!context.tableReady) return;
    const writes = checkinSentWrites({
      bookingId,
      items: context.items,
      documents: context.documents,
      rows: context.rows,
      actor,
      documentIds: hints.documentIds,
      flightLabels: hints.flightLabels,
    });
    await applyWrites(db, writes, {
      summary: "Enregistrement en ligne · envoyées au client",
      actorKind: actor === "bot" ? "auto" : "human",
    });
  } catch (err) {
    console.error("[checkin]", err instanceof Error ? "envoi" : "envoi");
  }
}

export async function saveCheckinStatus(
  db: SupabaseClient,
  input: {
    bookingId: string;
    itemId: string;
    requested: OnlineCheckinStatus;
    actor: OnlineCheckinActor;
    actorId?: string | null;
    route?: string;
  }
) {
  const context = await loadCheckinContext(db, input.bookingId);
  if (!context.tableReady) return { ok: false as const, error: "L’enregistrement en ligne n’est pas encore en place." };
  const flight = context.items.find((item) => item.id === input.itemId && item.kind === "flight");
  if (!flight || flight.lifecycle === "cancelled" || flight.lifecycle === "superseded") {
    return { ok: false as const, error: "Vol introuvable sur ce dossier." };
  }
  const view = viewsFromContext(context).find((line) => line.itemId === input.itemId);
  const stored = context.rows.find((row) => row.booking_item_id === input.itemId);
  const write = checkinManualWrite({
    bookingId: input.bookingId,
    itemId: input.itemId,
    requested: input.requested,
    stored: parseOnlineCheckinStatus(stored?.status),
    boardingPass: view?.status === "cartes_recues",
    sent: stored?.status === "envoyees" || view?.status === "envoyees",
    actor: input.actor,
  });
  const applied = await applyWrites(db, [write], {
    summary: `Enregistrement en ligne · ${input.route || view?.route || "vol"}`,
    actorKind: input.actor === "bot" ? "auto" : "human",
    actorId: input.actorId,
  });
  if (!applied.ok) {
    return {
      ok: false as const,
      error: applied.missing ? "L’enregistrement en ligne n’est pas encore en place." : "Enregistrement impossible.",
    };
  }
  const next = await loadCheckinContext(db, input.bookingId);
  const lines = viewsFromContext(next);
  return { ok: true as const, lines, write };
}

export function checkinLinesForRead(context: CheckinContext, now = new Date()): FlightCheckinView[] {
  return viewsFromContext(context, now);
}
