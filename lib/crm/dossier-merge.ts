import type { SupabaseClient } from "@supabase/supabase-js";
import { journalCanonical } from "@/lib/crm/agency-journal";
import { toAuditRow } from "@/lib/crm/audit-events";
import { syncBookingTitleFromSteps } from "@/lib/crm/bookings";
import { itemMatchKey } from "@/lib/crm/item-match";
import { namesReferToSamePerson } from "@/lib/crm/person-match";
import { DIFFERENT_CLIENT_HOLD, SAME_PASS_HOLD } from "@/lib/crm/trip-match";

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

export const VISIBLE_MERGE_HOLD =
  "Le séjour est déjà Visible. La réunion attend une validation.";
export const UNVERIFIED_MERGE_HOLD =
  "Des cartes ou des voyageurs à vérifier ne sont pas déplacés. La réunion attend une validation.";
export const JOURNAL_MERGE_HOLD =
  "La réunion n’a pas été journalisée. Rien n’a été déplacé.";

export type MergeOptions = {
  bornIds?: Set<string>;
  passStartedAt?: string | null;
};

export type DossierMergeTrace = {
  keepReference: string | null;
  dropReference: string | null;
  movedCards: string[];
  skippedCards: string[];
  movedTravelers: string[];
  skippedTravelers: string[];
  leftCards?: string[];
  leftTravelers?: string[];
  documentCount: number;
  /** Le dossier Visible n’est pas modifié. La réunion est seulement proposée. */
  held?: boolean;
};

/** Une carte lue dans un mail, pas encore relue par l’agence. */
export function cardNeedsReview(item: { details?: Record<string, unknown> | null }) {
  const details = item.details || {};
  if (details.needs_review === true) return true;
  return typeof details.email_ingest_id === "string" && details.email_ingest_id.length > 0;
}

/** Résumé du journal : le dossier retiré, et ce qui a été déplacé. */
export function dossierMergeSummary(trace: DossierMergeTrace) {
  const keep = trace.keepReference || "le dossier conservé";
  const drop = trace.dropReference || "le doublon";
  const leftCards = trace.leftCards || [];
  const leftTravelers = trace.leftTravelers || [];
  if (trace.held) {
    const parts = [`Réunion proposée : ${drop} n’est pas fusionné dans ${keep}.`];
    if (trace.movedCards.length) parts.push(`Cartes vérifiées déplacées : ${trace.movedCards.join(", ")}.`);
    if (leftCards.length) parts.push(`Cartes laissées à vérifier : ${leftCards.join(", ")}.`);
    if (leftTravelers.length) parts.push(`Voyageurs laissés à vérifier : ${leftTravelers.join(", ")}.`);
    return parts.join(" ");
  }
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
    cartes_laissez_a_verifier: trace.leftCards || [],
    voyageurs_deplaces: trace.movedTravelers,
    voyageurs_deja_presents: trace.skippedTravelers,
    voyageurs_laisses_a_verifier: trace.leftTravelers || [],
    pieces: trace.documentCount,
    proposee: Boolean(trace.held),
  };
}

async function proposalAlreadyNoted(admin: SupabaseClient, keepId: string, dropId: string) {
  const { data } = await admin
    .from("crm_audit_events")
    .select("id, detail")
    .eq("booking_id", keepId)
    .eq("action", "reunion_proposee");
  return ((data || []) as { detail?: { dossier_retire?: string } }[]).some(
    (row) => row.detail?.dossier_retire === dropId
  );
}

/** Le journal est obligatoire. Un échec d’écriture empêche la réunion. */
async function writeMergeJournal(
  admin: SupabaseClient,
  keepId: string,
  dropId: string,
  customerId: string | null,
  trace: DossierMergeTrace
) {
  if (trace.held && (await proposalAlreadyNoted(admin, keepId, dropId))) return true;
  const summary = dossierMergeSummary(trace).slice(0, 500);
  const detail = mergeDetail(keepId, dropId, trace);
  const diff = detail;
  try {
    const audit = await admin.from("crm_audit_events").insert(
      toAuditRow({
        actorKind: "auto",
        action: trace.held ? "reunion_proposee" : "dossiers_reunis",
        bookingId: keepId,
        customerId,
        summary,
        detail,
        source: "reunion",
      })
    );
    if (audit.error) return false;
  } catch {
    return false;
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
    if (journal.error) return false;
  } catch {
    return false;
  }
  return true;
}

function bornDuringPass(id: string, createdAt: unknown, options?: MergeOptions) {
  if (options?.bornIds?.has(id)) return true;
  const started = options?.passStartedAt || "";
  return Boolean(started && typeof createdAt === "string" && createdAt >= started);
}

type MailLink = { id: string; suggested_customer_id?: string | null };

/**
 * Un mail proposé pour un autre client ne suit pas le dossier gardé.
 * Son lien de dossier est retiré. Il reste dans la file.
 */
async function retargetEmails(admin: SupabaseClient, keepId: string, dropId: string, keepCustomer: string) {
  const { data } = await admin
    .from("crm_email_ingest")
    .select("id, suggested_customer_id")
    .eq("suggested_booking_id", dropId);
  for (const mail of (data || []) as MailLink[]) {
    const foreign = Boolean(mail.suggested_customer_id && mail.suggested_customer_id !== keepCustomer);
    await admin
      .from("crm_email_ingest")
      .update({ suggested_booking_id: foreign ? null : keepId })
      .eq("id", mail.id);
  }
}

/**
 * Réunit les cartes et les voyageurs du dossier en double sur le dossier gardé.
 * Deux clients ne sont jamais réunis : la file reçoit une proposition.
 * Un dossier déjà Visible le reste. Rien n’est envoyé au client.
 * Une carte bancaire sur le double bloque la réunion.
 * Le journal est écrit avant tout déplacement. S’il échoue, rien ne bouge.
 * Un voyageur déplacé n’est plus marqué titulaire.
 */
export async function mergeDossierInto(
  admin: SupabaseClient,
  keepId: string,
  dropId: string,
  options?: MergeOptions
) {
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
    admin
      .from("crm_bookings")
      .select("id, reference, customer_id, visible_to_client, created_at")
      .eq("id", keepId)
      .maybeSingle(),
    admin
      .from("crm_bookings")
      .select("id, reference, customer_id, visible_to_client, created_at")
      .eq("id", dropId)
      .maybeSingle(),
    admin
      .from("crm_booking_items")
      .select("id, kind, title, confirmation_ref, start_at, end_at, details")
      .eq("booking_id", keepId),
    admin
      .from("crm_booking_items")
      .select("id, kind, title, confirmation_ref, start_at, end_at, details")
      .eq("booking_id", dropId),
    admin.from("crm_booking_travelers").select("id, first_name, last_name, is_account_holder").eq("booking_id", keepId),
    admin.from("crm_booking_travelers").select("id, first_name, last_name, is_account_holder").eq("booking_id", dropId),
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
    leftCards: [],
    leftTravelers: [],
  };
  const customerId = (keepBooking?.customer_id as string | null) || null;
  const dropCustomer = (dropBooking?.customer_id as string | null) || null;
  const sameClient = Boolean(customerId && customerId === dropCustomer);
  const fresh =
    bornDuringPass(keepId, keepBooking?.created_at, options) ||
    bornDuringPass(dropId, dropBooking?.created_at, options);
  if (!sameClient || fresh) {
    trace.held = true;
    trace.documentCount = 0;
    trace.leftCards = ((dropItems || []) as ItemRow[]).map(cardLabel);
    trace.leftTravelers = ((dropTravelers || []) as TravelerRow[]).map(travelerLabel).filter(Boolean);
    const noted = await writeMergeJournal(admin, keepId, dropId, customerId, trace);
    if (!noted) return { ok: false as const, message: JOURNAL_MERGE_HOLD };
    return {
      ok: false as const,
      proposal: true as const,
      message: fresh && sameClient ? SAME_PASS_HOLD : DIFFERENT_CLIENT_HOLD,
    };
  }
  if (keepBooking?.visible_to_client) {
    trace.held = true;
    trace.documentCount = 0;
    trace.leftCards = ((dropItems || []) as ItemRow[]).map(cardLabel);
    trace.leftTravelers = ((dropTravelers || []) as TravelerRow[]).map(travelerLabel).filter(Boolean);
    const noted = await writeMergeJournal(admin, keepId, dropId, customerId, trace);
    if (!noted) return { ok: false as const, message: JOURNAL_MERGE_HOLD };
    return { ok: false as const, proposal: true as const, message: VISIBLE_MERGE_HOLD };
  }
  const matchable = (item: ItemRow) => ({ ...item, kind: item.kind || "fee" });
  const keptKeys = new Set(
    ((keepItems || []) as ItemRow[])
      .map((item) => itemMatchKey(matchable(item)))
      .filter((key): key is string => Boolean(key))
  );
  const dropCards = (dropItems || []) as ItemRow[];
  const moveItems: ItemRow[] = [];
  const dropItemsDup: ItemRow[] = [];
  for (const item of dropCards) {
    if (cardNeedsReview(item)) {
      trace.leftCards?.push(cardLabel(item));
      continue;
    }
    const key = itemMatchKey(matchable(item));
    if (key && keptKeys.has(key)) {
      dropItemsDup.push(item);
      trace.skippedCards.push(cardLabel(item));
      continue;
    }
    moveItems.push(item);
    trace.movedCards.push(cardLabel(item));
    if (key) keptKeys.add(key);
  }
  const travelers = [...((keepTravelers || []) as TravelerRow[])];
  const leaveTravelers = (trace.leftCards || []).length > 0;
  const moveTravelers: TravelerRow[] = [];
  const dropTravelersDup: TravelerRow[] = [];
  for (const traveler of (dropTravelers || []) as TravelerRow[]) {
    if (leaveTravelers) {
      const label = travelerLabel(traveler);
      if (label) trace.leftTravelers?.push(label);
      continue;
    }
    const same = travelers.some((row) =>
      namesReferToSamePerson(
        { first_name: row.first_name || "", last_name: row.last_name || "" },
        { first_name: traveler.first_name || "", last_name: traveler.last_name || "" }
      )
    );
    if (same) {
      dropTravelersDup.push(traveler);
      const label = travelerLabel(traveler);
      if (label) trace.skippedTravelers.push(label);
      continue;
    }
    moveTravelers.push(traveler);
    const label = travelerLabel(traveler);
    if (label) trace.movedTravelers.push(label);
    travelers.push(traveler);
  }
  const held = (trace.leftCards || []).length > 0 || (trace.leftTravelers || []).length > 0;
  if (held) {
    trace.held = true;
    trace.documentCount = 0;
  }
  const noted = await writeMergeJournal(admin, keepId, dropId, customerId, trace);
  if (!noted) return { ok: false as const, message: JOURNAL_MERGE_HOLD };
  for (const item of dropItemsDup) {
    await admin.from("crm_booking_items").delete().eq("id", item.id);
  }
  for (const item of moveItems) {
    const { error } = await admin.from("crm_booking_items").update({ booking_id: keepId }).eq("id", item.id);
    if (error) return { ok: false as const, message: "Les cartes n’ont pas pu être réunies." };
  }
  for (const traveler of dropTravelersDup) {
    await admin.from("crm_booking_travelers").delete().eq("id", traveler.id);
  }
  for (const traveler of moveTravelers) {
    const moved = await admin
      .from("crm_booking_travelers")
      .update({ booking_id: keepId, is_account_holder: false, proposed: true })
      .eq("id", traveler.id);
    const error =
      moved.error?.code === "42703"
        ? (
            await admin
              .from("crm_booking_travelers")
              .update({ booking_id: keepId, is_account_holder: false })
              .eq("id", traveler.id)
          ).error
        : moved.error;
    if (error) return { ok: false as const, message: "Les voyageurs n’ont pas pu être réunis." };
  }
  if (held) {
    return { ok: false as const, proposal: true as const, message: UNVERIFIED_MERGE_HOLD };
  }
  await admin.from("crm_booking_documents").update({ booking_id: keepId }).eq("booking_id", dropId);
  await admin.from("crm_le_bookings").update({ crm_booking_id: keepId, status: "linked" }).eq("crm_booking_id", dropId);
  await retargetEmails(admin, keepId, dropId, customerId || "");
  const { error } = await admin.from("crm_bookings").delete().eq("id", dropId);
  if (error) return { ok: false as const, message: "Le dossier en double n’a pas pu être retiré." };
  try {
    await syncBookingTitleFromSteps(admin, keepId);
  } catch {
    // Le titre sera repris au prochain enregistrement. Les cartes sont déjà réunies.
  }
  return { ok: true as const, message: null };
}
