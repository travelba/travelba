import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  depositEmailAttachments,
  markEmailAttached,
  resolveEmailCardId,
} from "@/lib/crm/email-attach-run";
import {
  cardsDepositMessage,
  mailPlainText,
  matchPliantProposals,
  readDepositServices,
  type PliantProposal,
  type PliantSnap,
} from "@/lib/crm/email-service-deposit";
import { hasUsableFlight, planFlightDeposit } from "@/lib/crm/email-flight-deposit";
import { depositFlightsOnBooking, prepareFlightDepositExtract } from "@/lib/crm/email-flight-deposit-run";
import { enterFlightRematch, leaveFlightRematch } from "@/lib/crm/email-flight-rematch";
import { applyBookingSteps, previewBookingSteps } from "@/lib/crm/email-step-run";
import { isCancellationExtract, parseExtractPayloadSafe, type BookingExtract } from "@/lib/crm/ingest-types";
import { findFlightCard, findMatchingItem, type MatchableItem } from "@/lib/crm/item-match";
import { pliantExpenseOrigin } from "@/lib/crm/pliant-expense";
import type { CrmEmailIngest } from "@/lib/crm/types";

function asExtract(value: unknown): BookingExtract | null {
  if (!value || typeof value !== "object") return null;
  return parseExtractPayloadSafe(value);
}

function money(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

async function cardIdsForItems(admin: SupabaseClient, bookingId: string, items: MatchableItem[]) {
  const { data } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, supplier, confirmation_ref, start_at, end_at, details, lifecycle")
    .eq("booking_id", bookingId);
  const cards = ((data || []) as (MatchableItem & { id: string; lifecycle?: string | null })[]).filter(
    (row) => row.lifecycle !== "cancelled" && row.lifecycle !== "superseded"
  );
  const ids: string[] = [];
  for (const item of items) {
    const hit = (item.kind || "") === "flight" ? findFlightCard(cards, item) : findMatchingItem(cards, item);
    if (hit?.id && !ids.includes(hit.id)) ids.push(hit.id);
  }
  return ids;
}

async function pliantSnaps(admin: SupabaseClient, bookingId: string): Promise<PliantSnap[]> {
  const snaps: PliantSnap[] = [];
  const { data: items, error } = await admin
    .from("crm_booking_items")
    .select("id, title, amount, details, lifecycle, kind")
    .eq("booking_id", bookingId)
    .eq("kind", "expense");
  if (!error) {
    for (const row of items || []) {
      if (row.lifecycle === "cancelled" || row.lifecycle === "superseded") continue;
      const origin = pliantExpenseOrigin(row.details, row.amount);
      if (!origin) continue;
      const amount = origin.amount ?? money(row.amount);
      if (amount == null) continue;
      snaps.push({ id: String(row.id), amount, label: String(row.title || origin.merchant || "Pliant") });
    }
  }
  const { data: costs, error: costError } = await admin
    .from("crm_trip_costs")
    .select("id, amount_eur, supplier")
    .eq("booking_id", bookingId)
    .eq("source", "pliant");
  if (!costError) {
    for (const row of costs || []) {
      const amount = money(row.amount_eur);
      if (amount == null) continue;
      if (snaps.some((snap) => Math.abs(snap.amount - amount) < 0.005)) continue;
      snaps.push({ id: String(row.id), amount, label: String(row.supplier || "Pliant") });
    }
  }
  return snaps;
}

/**
 * Dépose les fichiers et crée ou complète les cartes du mail, vols compris.
 * Les cartes nouvelles restent cachées. Le prix de vente reste 0 s’il n’est pas déjà saisi.
 * Une dépense Pliant du même montant est proposée, pas rattachée.
 */
export async function depositCardsOnBooking(
  admin: SupabaseClient,
  row: CrmEmailIngest,
  bookingId: string,
  customerId: string,
  actorId: string | null
) {
  const extract = asExtract(row.extract);
  if (!extract || isCancellationExtract(extract)) return { wrote: false as const, message: "" };
  const body = mailPlainText(row.body_text, row.body_html);
  const services = readDepositServices(extract, body);
  if (hasUsableFlight(extract) && !services.items.length) {
    return depositFlightsOnBooking(admin, row, bookingId, customerId, actorId);
  }
  if (!services.items.length && !hasUsableFlight(extract)) return { wrote: false as const, message: "" };

  enterFlightRematch();
  try {
    const flightPrepared = hasUsableFlight(extract)
      ? await prepareFlightDepositExtract(admin, bookingId, extract, row.id)
      : null;
    const flightsCancelled = flightPrepared?.document_status === "cancelled";
    const flightItems = flightsCancelled ? [] : flightPrepared?.items || [];
    if (!flightItems.length && !services.items.length) {
      return { wrote: false as const, message: "" };
    }
    const prepared = {
      ...extract,
      travelers: services.travelers.length ? services.travelers : extract.travelers,
      items: [...flightItems, ...services.items],
    } as BookingExtract;
    const preview = await previewBookingSteps(admin, bookingId, prepared);
    if (!preview.etapes.length) return { wrote: false as const, message: "" };
    await applyBookingSteps({
      admin,
      bookingId,
      customerId,
      extract: prepared,
      staffUserId: actorId,
      emailIngestId: row.id,
      visibleToClient: false,
      skipTicketingFee: true,
    });
    const cardIds = await cardIdsForItems(admin, bookingId, prepared.items || []);
    const cardId = cardIds[0] || (await resolveEmailCardId(admin, bookingId, prepared));
    const deposited = await depositEmailAttachments(
      admin,
      bookingId,
      row.id,
      row.attachments,
      cardId,
      { subject: row.subject, text: row.body_text, html: row.body_html },
      cardIds
    );
    const costs = preview.etapes
      .map((step) => step.prix_fournisseur)
      .filter((value): value is number => value != null && value > 0);
    let proposals: PliantProposal[] = [];
    try {
      proposals = matchPliantProposals(costs, await pliantSnaps(admin, bookingId));
    } catch {
      proposals = [];
    }
    const flightNote = flightItems.length ? flightDepositTail(prepared) : "";
    const message = `${cardsDepositMessage(preview.etapes, proposals)}${flightNote}`;
    await markEmailAttached(admin, row, {
      bookingId,
      customerId,
      actorId,
      summary: `${message}${deposited.added ? ` ${deposited.added} pièce(s).` : ""}`,
      cards: true,
      auditAction: "attach_cards",
    });
    return {
      wrote: true as const,
      message,
      pieces: deposited.added,
      cartes: preview.etapes.length,
      etapes: preview.etapes,
      pliant: proposals,
    };
  } finally {
    leaveFlightRematch();
  }
}

function flightDepositTail(extract: BookingExtract) {
  const plan = planFlightDeposit(extract);
  if (!plan.cartes.length) return "";
  const vols = plan.cartes
    .map((card) => card.lignes.map((line) => line.vol).filter(Boolean).join(", "))
    .filter(Boolean)
    .join(" · ");
  return vols ? ` Vols : ${vols}.` : "";
}
