import type { SupabaseClient } from "@supabase/supabase-js";
import { journalCanonical } from "@/lib/crm/agency-journal";
import { toAuditRow } from "@/lib/crm/audit-events";
import { syncBookingTitleFromSteps } from "@/lib/crm/bookings";
import { itemMatchKey } from "@/lib/crm/item-match";
import { namesReferToSamePerson } from "@/lib/crm/person-match";

type ItemRow = {
  id: string;
  kind?: string | null;
  title?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

type TravelerRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
};

export type DossierMergeTrace = {
  keepReference: string | null;
  dropReference: string | null;
  movedCards: string[];
  skippedCards: string[];
  movedTravelers: string[];
  skippedTravelers: string[];
  documentCount: number;
};

/** Résumé du journal : le dossier retiré, et ce qui a été déplacé. */
export function dossierMergeSummary(trace: DossierMergeTrace) {
  const keep = trace.keepReference || "le dossier conservé";
  const drop = trace.dropReference || "le doublon";
  const parts = [`Dossier ${drop} réuni dans ${keep}, puis retiré.`];
  if (trace.movedCards.length) parts.push(`Cartes déplacées : ${trace.movedCards.join(", ")}.`);
  if (trace.skippedCards.length) parts.push(`Cartes déjà présentes : ${trace.skippedCards.join(", ")}.`);
  if (trace.movedTravelers.length) parts.push(`Voyageurs déplacés : ${trace.movedTravelers.join(", ")}.`);
  if (trace.skippedTravelers.length) parts.push(`Voyageurs déjà présents : ${trace.skippedTravelers.join(", ")}.`);
  if (trace.documentCount === 1) parts.push("1 pièce déplacée.");
  else if (trace.documentCount > 1) parts.push(`${trace.documentCount} pièces déplacées.`);
  return parts.join(" ");
}

function cardLabel(item: ItemRow) {
  return (item.title || item.kind || "Carte").trim().slice(0, 80);
}

function travelerLabel(traveler: TravelerRow) {
  return [traveler.first_name, traveler.last_name].map((part) => (part || "").trim()).filter(Boolean).join(" ");
}

function mergeDetail(keepId: string, dropId: string, trace: DossierMergeTrace) {
  return {
    dossier_garde: keepId,
    reference_gardee: trace.keepReference,
    dossier_retire: dropId,
    reference_retiree: trace.dropReference,
    cartes_deplacees: trace.movedCards,
    cartes_deja_presentes: trace.skippedCards,
    voyageurs_deplaces: trace.movedTravelers,
    voyageurs_deja_presents: trace.skippedTravelers,
    pieces: trace.documentCount,
  };
}

async function writeMergeJournal(
  admin: SupabaseClient,
  keepId: string,
  dropId: string,
  customerId: string | null,
  trace: DossierMergeTrace
) {
  const summary = dossierMergeSummary(trace).slice(0, 500);
  const detail = mergeDetail(keepId, dropId, trace);
  const diff = detail;
  try {
    const audit = await admin.from("crm_audit_events").insert(
      toAuditRow({
        actorKind: "auto",
        action: "dossiers_reunis",
        bookingId: keepId,
        customerId,
        summary,
        detail,
        source: "reunion",
      })
    );
    if (audit.error) console.error("[reunion] journal", audit.error.code ?? "?");
  } catch {
    console.error("[reunion] journal");
  }
  try {
    const row = {
      staff_id: null,
      action: "update",
      entity_type: "dossier",
      entity_id: keepId,
      summary: summary.slice(0, 500),
      diff,
      ip: null,
      user_agent: null,
      path: null,
      canonical: journalCanonical({
        action: "update",
        entityType: "dossier",
        entityId: keepId,
        summary,
        diff,
      }),
      row_hash: "pending",
    };
    const journal = await admin.from("crm_agency_journal").insert(row);
    if (journal.error) console.error("[reunion] activité", journal.error.code ?? "?");
  } catch {
    console.error("[reunion] activité");
  }
}

/**
 * Réunit les cartes et les voyageurs du dossier en double sur le dossier gardé.
 * Un dossier déjà Visible le reste. Rien n’est envoyé au client.
 * Une carte bancaire sur le double bloque la réunion.
 * Le journal d’activité nomme le dossier retiré et ce qui a été déplacé.
 */
export async function mergeDossierInto(admin: SupabaseClient, keepId: string, dropId: string) {
  if (!keepId || !dropId || keepId === dropId) return { ok: true as const, message: null };
  const { data: cards } = await admin.from("crm_booking_cards").select("id").eq("booking_id", dropId);
  if ((cards || []).length) {
    return {
      ok: false as const,
      message: "Deux dossiers correspondent, mais l’un a une carte bancaire. Ils n’ont pas été réunis.",
    };
  }
  const [
    { data: keepBooking },
    { data: dropBooking },
    { data: keepItems },
    { data: dropItems },
    { data: keepTravelers },
    { data: dropTravelers },
    { data: documents },
  ] = await Promise.all([
    admin.from("crm_bookings").select("id, reference, customer_id").eq("id", keepId).maybeSingle(),
    admin.from("crm_bookings").select("id, reference, customer_id").eq("id", dropId).maybeSingle(),
    admin
      .from("crm_booking_items")
      .select("id, kind, title, confirmation_ref, start_at, end_at, details")
      .eq("booking_id", keepId),
    admin
      .from("crm_booking_items")
      .select("id, kind, title, confirmation_ref, start_at, end_at, details")
      .eq("booking_id", dropId),
    admin.from("crm_booking_travelers").select("id, first_name, last_name").eq("booking_id", keepId),
    admin.from("crm_booking_travelers").select("id, first_name, last_name").eq("booking_id", dropId),
    admin.from("crm_booking_documents").select("id, file_name").eq("booking_id", dropId),
  ]);
  const trace: DossierMergeTrace = {
    keepReference: (keepBooking?.reference as string | null) || null,
    dropReference: (dropBooking?.reference as string | null) || null,
    movedCards: [],
    skippedCards: [],
    movedTravelers: [],
    skippedTravelers: [],
    documentCount: (documents || []).length,
  };
  const matchable = (item: ItemRow) => ({ ...item, kind: item.kind || "fee" });
  const keptKeys = new Set(
    ((keepItems || []) as ItemRow[])
      .map((item) => itemMatchKey(matchable(item)))
      .filter((key): key is string => Boolean(key))
  );
  for (const item of (dropItems || []) as ItemRow[]) {
    const key = itemMatchKey(matchable(item));
    if (key && keptKeys.has(key)) {
      await admin.from("crm_booking_items").delete().eq("id", item.id);
      trace.skippedCards.push(cardLabel(item));
      continue;
    }
    const { error } = await admin.from("crm_booking_items").update({ booking_id: keepId }).eq("id", item.id);
    if (error) return { ok: false as const, message: "Les cartes n’ont pas pu être réunies." };
    trace.movedCards.push(cardLabel(item));
    if (key) keptKeys.add(key);
  }
  const travelers = (keepTravelers || []) as TravelerRow[];
  for (const traveler of (dropTravelers || []) as TravelerRow[]) {
    const same = travelers.some((row) =>
      namesReferToSamePerson(
        { first_name: row.first_name || "", last_name: row.last_name || "" },
        { first_name: traveler.first_name || "", last_name: traveler.last_name || "" }
      )
    );
    if (same) {
      await admin.from("crm_booking_travelers").delete().eq("id", traveler.id);
      const label = travelerLabel(traveler);
      if (label) trace.skippedTravelers.push(label);
      continue;
    }
    const { error } = await admin.from("crm_booking_travelers").update({ booking_id: keepId }).eq("id", traveler.id);
    if (error) return { ok: false as const, message: "Les voyageurs n’ont pas pu être réunis." };
    const label = travelerLabel(traveler);
    if (label) trace.movedTravelers.push(label);
    travelers.push(traveler);
  }
  await admin.from("crm_booking_documents").update({ booking_id: keepId }).eq("booking_id", dropId);
  await admin.from("crm_le_bookings").update({ crm_booking_id: keepId, status: "linked" }).eq("crm_booking_id", dropId);
  await admin
    .from("crm_email_ingest")
    .update({ suggested_booking_id: keepId })
    .eq("suggested_booking_id", dropId);
  const { error } = await admin.from("crm_bookings").delete().eq("id", dropId);
  if (error) return { ok: false as const, message: "Le dossier en double n’a pas pu être retiré." };
  await writeMergeJournal(admin, keepId, dropId, (keepBooking?.customer_id as string | null) || null, trace);
  try {
    await syncBookingTitleFromSteps(admin, keepId);
  } catch {
    // Le titre sera repris au prochain enregistrement. Les cartes sont déjà réunies.
  }
  return { ok: true as const, message: null };
}
