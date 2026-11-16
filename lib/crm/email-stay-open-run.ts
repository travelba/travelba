import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { depositEmailAttachments, markEmailAttached, resolveEmailCardId } from "@/lib/crm/email-attach-run";
import { autoAttachMatchedFlight } from "@/lib/crm/email-flight-deposit-run";
import { hasUsableFlight } from "@/lib/crm/email-flight-deposit";
import { IMPORT_AUTO_NOTE } from "@/lib/crm/email-detach";
import { parseExtractPayloadSafe, type BookingExtract } from "@/lib/crm/ingest-types";
import type { CrmEmailIngest } from "@/lib/crm/types";

function saleFree(extract: BookingExtract): BookingExtract {
  return {
    ...extract,
    items: (extract.items || []).map((item) => ({ ...item, amount: 0 })),
  };
}

/** Ouvre un séjour caché pour un client déjà connu. N’invite pas, n’écrit pas au client. */
export async function autoCreateStayFromMail(admin: SupabaseClient, row: CrmEmailIngest, customerId: string) {
  const current = row.extract ? parseExtractPayloadSafe(row.extract) : null;
  if (!current) return { wrote: false as const };
  const extract = saleFree(current);
  const { loadEmailIngestFiles } = await import("@/lib/crm/email-ingest");
  const { persistNewBookingFromExtract } = await import("@/lib/crm/ingest-booking");
  const files = await loadEmailIngestFiles(row);
  const booking = await persistNewBookingFromExtract({
    customerId,
    extract,
    files,
    status: "draft",
    visibleToClient: false,
    emailIngestId: row.id,
  });
  await admin
    .from("crm_bookings")
    .update({
      visible_to_client: false,
      status: "draft",
      notes_client: null,
      notes_internal: IMPORT_AUTO_NOTE,
    })
    .eq("id", booking.id);
  await markEmailAttached(admin, { ...row, extract }, {
    bookingId: booking.id,
    customerId,
    actorId: null,
    summary: "Dossier créé automatiquement. Séjour non visible, aucun message.",
    cards: true,
    auditAction: "auto_create",
  });
  return { wrote: true as const, bookingId: booking.id };
}

/** Dépose un hôtel sur le dossier déjà ouvert. Le prix de vente reste 0. */
export async function autoAttachMatchedHotel(
  admin: SupabaseClient,
  row: CrmEmailIngest,
  decision: { bookingId: string; customerId: string; reason: string }
) {
  const current = row.extract ? parseExtractPayloadSafe(row.extract) : null;
  if (!current) return { wrote: false as const };
  const extract = saleFree(current);
  const { applyReplacementToBooking } = await import("@/lib/crm/ingest-booking");
  await applyReplacementToBooking({
    bookingId: decision.bookingId,
    customerId: decision.customerId,
    extract,
    visibleToClient: false,
    emailIngestId: row.id,
    skipTicketingFee: false,
  });
  const cardId = await resolveEmailCardId(admin, decision.bookingId, extract);
  const deposited = await depositEmailAttachments(admin, decision.bookingId, row.id, row.attachments, cardId, {
    subject: row.subject,
    text: row.body_text,
    html: row.body_html,
  });
  await markEmailAttached(admin, { ...row, extract }, {
    bookingId: decision.bookingId,
    customerId: decision.customerId,
    actorId: null,
    summary: `Séjour rattaché automatiquement (${decision.reason}).${deposited.added ? ` ${deposited.added} pièce(s).` : ""}`,
    cards: true,
    auditAction: "auto_attach",
  });
  return { wrote: true as const, bookingId: decision.bookingId };
}

export async function autoSettleStay(
  admin: SupabaseClient,
  row: CrmEmailIngest,
  decision: { bookingId: string; customerId: string; reason: string }
) {
  const extract = row.extract ? parseExtractPayloadSafe(row.extract) : null;
  if (extract && hasUsableFlight(extract)) {
    const result = await autoAttachMatchedFlight(admin, { ...row, extract }, decision);
    return { wrote: result.wrote, bookingId: decision.bookingId };
  }
  return autoAttachMatchedHotel(admin, row, decision);
}
