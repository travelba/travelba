import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  depositEmailAttachments,
  markEmailAttached,
  resolveEmailCardId,
} from "@/lib/crm/email-attach-run";
import {
  decideFlightAutoAttach,
  flightOnlyExtract,
  hasUsableFlight,
  planFlightDeposit,
  sumFlightTicketCounts,
  type FlightAutoDecision,
} from "@/lib/crm/email-flight-deposit";
import { applyBookingSteps } from "@/lib/crm/email-step-run";
import { enterFlightRematch, leaveFlightRematch } from "@/lib/crm/email-flight-rematch";
import { parseExtractPayloadSafe, type BookingExtract } from "@/lib/crm/ingest-types";
import type { MatchableItem } from "@/lib/crm/item-match";
import type { CrmEmailIngest } from "@/lib/crm/types";

function asExtract(value: unknown): BookingExtract | null {
  if (!value || typeof value !== "object") return null;
  return parseExtractPayloadSafe(value);
}

async function foldedExtracts(admin: SupabaseClient, rowId: string): Promise<BookingExtract[]> {
  const { data } = await admin
    .from("crm_email_ingest")
    .select("id, extract")
    .eq("grouped_into", rowId)
    .neq("id", rowId)
    .limit(40);
  const extracts: BookingExtract[] = [];
  for (const row of data || []) {
    const extract = asExtract(row.extract);
    if (extract && hasUsableFlight(extract)) extracts.push(extract);
  }
  return extracts;
}

/** Prépare les vols : nombre de billets additionné, prix de vente 0, coût seulement s’il est imprimé. */
export async function prepareFlightDepositExtract(
  admin: SupabaseClient,
  bookingId: string,
  extract: BookingExtract,
  emailId: string
) {
  const [{ data: items }, folded] = await Promise.all([
    admin
      .from("crm_booking_items")
      .select("id, kind, title, supplier, confirmation_ref, start_at, end_at, details, lifecycle")
      .eq("booking_id", bookingId),
    foldedExtracts(admin, emailId),
  ]);
  const summed = sumFlightTicketCounts(extract, (items || []) as MatchableItem[], emailId, folded);
  return flightOnlyExtract(summed);
}

export function flightDepositSummary(extract: BookingExtract) {
  const plan = planFlightDeposit(extract);
  if (!plan.cartes.length) return "Les pièces sont déposées. Aucun vol exploitable.";
  const vols = plan.cartes
    .map((card) => {
      const lines = card.lignes.map((line) => line.vol).filter(Boolean).join(", ");
      const cost = card.cout == null ? "sans coût imprimé" : `coût ${card.cout}`;
      return `${card.pnr} (${lines}, ${cost})`;
    })
    .join(" · ");
  return `Vols déposés, cachés, prix de vente 0 € : ${vols}. Aucun message.`;
}

/**
 * Dépose les fichiers et crée ou complète les cartes vol.
 * Les cartes nouvelles restent cachées. Le dépôt automatique tient les frais de billeterie au nombre de voyageurs.
 */
export async function depositFlightsOnBooking(
  admin: SupabaseClient,
  row: CrmEmailIngest,
  bookingId: string,
  customerId: string,
  actorId: string | null,
  opts?: { automatic?: boolean; reason?: string }
) {
  const extract = asExtract(row.extract);
  if (!extract || !hasUsableFlight(extract)) return { wrote: false as const, message: "" };
  enterFlightRematch();
  try {
  const prepared = await prepareFlightDepositExtract(admin, bookingId, extract, row.id);
  if (!(prepared.items || []).length) return { wrote: false as const, message: "" };
  await applyBookingSteps({
    admin,
    bookingId,
    customerId,
    extract: prepared,
    staffUserId: actorId,
    emailIngestId: row.id,
    visibleToClient: false,
    skipTicketingFee: opts?.automatic ? false : true,
  });
  const cardId = await resolveEmailCardId(admin, bookingId, prepared);
  const deposited = await depositEmailAttachments(admin, bookingId, row.id, row.attachments, cardId, {
    subject: row.subject,
    text: row.body_text,
    html: row.body_html,
  });
  const message = flightDepositSummary(prepared);
  const reason = opts?.reason ? ` (${opts.reason})` : "";
  const lead = opts?.automatic ? `Billet rattaché automatiquement${reason}. ` : "";
  await markEmailAttached(admin, row, {
    bookingId,
    customerId,
    actorId,
    summary: `${lead}${message}${deposited.added ? ` ${deposited.added} pièce(s).` : ""}`,
    cards: true,
    auditAction: opts?.automatic ? "auto_attach" : "attach_flights",
  });
  return { wrote: true as const, message, pieces: deposited.added, cartes: planFlightDeposit(prepared).cartes.length };
  } finally {
    leaveFlightRematch();
  }
}

/** À l’ingestion : un seul dossier à forte confiance. Rien n’est envoyé. Le détachement annule. */
export async function autoAttachMatchedFlight(
  admin: SupabaseClient,
  row: CrmEmailIngest,
  decision: FlightAutoDecision
) {
  return depositFlightsOnBooking(admin, row, decision.bookingId, decision.customerId, null, {
    automatic: true,
    reason: decision.reason,
  });
}

export function flightAutoDecisionFromRow(row: Pick<CrmEmailIngest, "extract" | "candidates">) {
  return decideFlightAutoAttach(asExtract(row.extract), row.candidates || []);
}
