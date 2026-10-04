import "server-only";

import { IMPORT_AUTO_NOTE } from "@/lib/crm/email-detach";
import { runEmailAutoCreate } from "@/lib/crm/email-ingest-create";
import { persistNewBookingFromExtract } from "@/lib/crm/ingest-booking";
import { parseExtractPayloadSafe } from "@/lib/crm/ingest-types";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmEmailIngest } from "@/lib/crm/types";

/**
 * Après le parse d’un mail reçu : crée le dossier, et la fiche client s’il
 * n’en existe pas. Ne rattache pas, n’annule pas, n’invite pas, ne publie pas.
 */
export async function autoCreateBookingFromIngestId(id: string) {
  const admin = createServiceClient();
  try {
    const { data } = await admin.from("crm_email_ingest").select("*").eq("id", id).maybeSingle();
    if (!data) return { created: false, bookingId: null, hold: null };
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
        if (error?.code === "23505") {
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
    return { created: false, bookingId: null, hold: null };
  }
}
