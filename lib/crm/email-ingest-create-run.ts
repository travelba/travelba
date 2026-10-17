import "server-only";

import { IMPORT_AUTO_NOTE } from "@/lib/crm/email-detach";
import {
  AUTO_STAY_NOTE,
  hasObsoleteEmailHold,
  runEmailAutoCreate,
  withoutObsoleteEmailHold,
} from "@/lib/crm/email-ingest-create";
import {
  applyCancellationToBooking,
  applyReplacementToBooking,
  persistNewBookingFromExtract,
} from "@/lib/crm/ingest-booking";
import { parseExtractPayloadSafe } from "@/lib/crm/ingest-types";
import type { LifecycleCard } from "@/lib/crm/item-lifecycle";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmEmailIngest } from "@/lib/crm/types";

/**
 * Après le parse d’un mail reçu : crée le premier dossier, ou met à jour
 * l’itinéraire quand un seul séjour est reconnu. N’invite pas, ne publie pas.
 */
export async function autoCreateBookingFromIngestId(id: string) {
  const admin = createServiceClient();
  try {
    const { data } = await admin.from("crm_email_ingest").select("*").eq("id", id).maybeSingle();
    if (!data) return { created: false, applied: false, bookingId: null, hold: null };
    const row = data as CrmEmailIngest;
    return await runEmailAutoCreate(row, {
      findCustomerByEmail: async (email) => {
        const { data: existing } = await admin
          .from("crm_customers")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        return (existing?.id as string | undefined) || null;
      },
      createCustomer: async (input) => {
        if (!input.email) {
          const { data: named } = await admin
            .from("crm_customers")
            .select("id, first_name, last_name")
            .ilike("last_name", input.lastName);
          const fold = (value: string | null) =>
            (value || "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim()
              .toLowerCase();
          const hits = (named || []).filter(
            (row) =>
              fold(row.first_name) === fold(input.firstName) &&
              fold(row.last_name) === fold(input.lastName)
          );
          if (hits.length > 1) throw new Error("Plusieurs fiches portent ce nom.");
          if (hits.length === 1 && hits[0].id) return hits[0].id as string;
        }
        const { data: created, error } = await admin
          .from("crm_customers")
          .insert({
            email: input.email,
            first_name: input.firstName,
            last_name: input.lastName,
            language: "fr",
          })
          .select("id")
          .single();
        if (error?.code === "23505" && input.email) {
          const { data: existing } = await admin
            .from("crm_customers")
            .select("id")
            .eq("email", input.email)
            .maybeSingle();
          if (existing?.id) return existing.id as string;
        }
        if (error || !created?.id) throw new Error("Création du compte impossible.");
        return created.id as string;
      },
      persist: async (customerId) => {
        const { loadEmailIngestFiles } = await import("@/lib/crm/email-ingest");
        const files = await loadEmailIngestFiles(row);
        const booking = await persistNewBookingFromExtract({
          customerId,
          extract: parseExtractPayloadSafe(row.extract),
          files,
          status: "draft",
          visibleToClient: false,
          emailIngestId: row.id,
        });
        // Le persist promeut une confirmation en « confirmed ». On garde le brouillon :
        // le carnet n’est pas montré, et un détachement peut encore retirer le dossier.
        await admin
          .from("crm_bookings")
          .update({ notes_internal: IMPORT_AUTO_NOTE, status: "draft" })
          .eq("id", booking.id);
        return { id: booking.id };
      },
      loadItems: async (bookingId) => {
        const { data } = await admin
          .from("crm_booking_items")
          .select("id, kind, title, confirmation_ref, start_at, end_at, details, lifecycle, amount, include_in_ledger")
          .eq("booking_id", bookingId);
        return (data || []) as LifecycleCard[];
      },
      applyStay: async (input) => {
        const { loadEmailIngestFiles } = await import("@/lib/crm/email-ingest");
        const files = await loadEmailIngestFiles(row);
        const extract = parseExtractPayloadSafe(row.extract);
        if (input.gesture === "cancel") {
          await applyCancellationToBooking({
            bookingId: input.bookingId,
            customerId: input.customerId,
            extract,
            files,
            visibleToClient: false,
          });
        } else {
          await applyReplacementToBooking({
            bookingId: input.bookingId,
            customerId: input.customerId,
            extract,
            files,
            visibleToClient: false,
            emailIngestId: row.id,
          });
        }
        const { data: booking } = await admin
          .from("crm_bookings")
          .select("notes_internal")
          .eq("id", input.bookingId)
          .maybeSingle();
        const previous = String(booking?.notes_internal || "").trim();
        if (!previous.includes(AUTO_STAY_NOTE)) {
          await admin
            .from("crm_bookings")
            .update({
              notes_internal: previous ? `${previous}\n${AUTO_STAY_NOTE}` : AUTO_STAY_NOTE,
            })
            .eq("id", input.bookingId);
        }
      },
      markApplied: async (bookingId, customerId) => {
        await admin
          .from("crm_email_ingest")
          .update({
            status: "attached",
            suggested_booking_id: bookingId,
            suggested_customer_id: customerId,
            error: null,
          })
          .eq("id", row.id);
      },
      markCreated: async (bookingId, customerId) => {
        await admin
          .from("crm_email_ingest")
          .update({
            status: "attached",
            created_booking_id: bookingId,
            suggested_customer_id: customerId,
            error: null,
          })
          .eq("id", row.id);
      },
      hold: async (message) => {
        const warnings = Array.isArray(row.warnings) ? row.warnings : [];
        if (warnings.some((warning) => warning.message === message)) return;
        await admin
          .from("crm_email_ingest")
          .update({ warnings: [...warnings, { file: "création", message }] })
          .eq("id", row.id);
      },
      fail: async (message) => {
        await admin.from("crm_email_ingest").update({ error: message }).eq("id", row.id);
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Création automatique impossible";
    await admin.from("crm_email_ingest").update({ error: message }).eq("id", id);
    return { created: false, applied: false, bookingId: null, hold: null };
  }
}

/**
 * Reprend les mails tenus par l’ancienne règle « pas d’e-mail client ».
 * Le nom imprimé suffit : la fiche est créée, le dossier reste un brouillon caché.
 */
export async function retryObsoleteEmailHolds(limit = 20) {
  const admin = createServiceClient();
  // Le motif se termine par un point : un filtre PostgREST le couperait. On trie en mémoire.
  const { data } = await admin
    .from("crm_email_ingest")
    .select("id, warnings, error")
    .in("status", ["parsed", "matched"])
    .is("created_booking_id", null)
    .order("received_at", { ascending: true, nullsFirst: true })
    .limit(100);
  const rows = (data || [])
    .filter(
      (row) =>
        !String(row.error || "").trim() &&
        hasObsoleteEmailHold(row.warnings as { message?: string | null }[] | null)
    )
    .slice(0, limit);
  let created = 0;
  let applied = 0;
  let held = 0;
  for (const row of rows) {
    const result = await autoCreateBookingFromIngestId(row.id);
    if (result.created) created += 1;
    else if (result.applied) applied += 1;
    else held += 1;
    if (!result.created && !result.applied) continue;
    const { data: fresh } = await admin
      .from("crm_email_ingest")
      .select("warnings")
      .eq("id", row.id)
      .maybeSingle();
    const warnings = withoutObsoleteEmailHold(
      (fresh?.warnings as { message?: string | null }[] | null) || []
    );
    await admin.from("crm_email_ingest").update({ warnings }).eq("id", row.id);
  }
  return { scanned: rows.length, created, applied, held };
}
