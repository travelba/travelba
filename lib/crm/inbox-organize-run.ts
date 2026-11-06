import "server-only";

import { loadSuppressions } from "@/lib/crm/booking-suppression";
import { mergeDossierInto } from "@/lib/crm/dossier-merge";
import { executeInboxPlan, planInboxOrganization, type InboxHandlers } from "@/lib/crm/inbox-organize";
import { parseExtractPayloadSafe } from "@/lib/crm/ingest-types";
import { namesReferToSamePerson } from "@/lib/crm/person-match";
import { createServiceClient } from "@/lib/supabase/admin";
import { tripDossierFromRows, type TripDossier, type TripPerson } from "@/lib/crm/trip-match";
import type { CrmEmailIngest } from "@/lib/crm/types";

type Admin = ReturnType<typeof createServiceClient>;

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function ensureCompanions(admin: Admin, customerId: string, people: TripPerson[]) {
  const { data: customer } = await admin
    .from("crm_customers")
    .select("id, first_name, last_name")
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) return;
  const { data } = await admin
    .from("crm_travel_companions")
    .select("id, first_name, last_name")
    .eq("customer_id", customerId);
  const companions = (data || []) as { id: string; first_name: string | null; last_name: string | null }[];
  for (const person of people) {
    if (namesReferToSamePerson(person, customer)) continue;
    if (companions.some((row) => namesReferToSamePerson(person, row))) continue;
    const { data: created } = await admin
      .from("crm_travel_companions")
      .insert({ customer_id: customerId, first_name: person.first_name, last_name: person.last_name })
      .select("id, first_name, last_name")
      .single();
    if (created) companions.push(created as { id: string; first_name: string | null; last_name: string | null });
  }
}

async function loadDossiers(admin: Admin): Promise<TripDossier[]> {
  const [{ data: bookings }, { data: items }, { data: travelers }, { data: customers }] = await Promise.all([
    admin
      .from("crm_bookings")
      .select("id, reference, title, destination, customer_id, status, start_date, end_date, visible_to_client, archived_at")
      .is("archived_at", null)
      .neq("status", "cancelled"),
    admin
      .from("crm_booking_items")
      .select("booking_id, kind, title, start_at, end_at, details, lifecycle"),
    admin.from("crm_booking_travelers").select("booking_id, first_name, last_name"),
    admin.from("crm_customers").select("id, first_name, last_name, usage_name"),
  ]);
  const peopleByBooking = new Map<string, TripPerson[]>();
  const customersById = new Map(
    ((customers || []) as { id: string; first_name: string | null; last_name: string | null; usage_name?: string | null }[]).map(
      (row) => [row.id, row]
    )
  );
  for (const booking of bookings || []) {
    const holder = booking.customer_id ? customersById.get(booking.customer_id) : undefined;
    const people: TripPerson[] = [];
    if (holder?.first_name || holder?.last_name) {
      people.push({ first_name: holder.first_name || "", last_name: holder.last_name || "" });
    }
    if (holder?.usage_name && holder.first_name) {
      people.push({ first_name: holder.first_name, last_name: holder.usage_name });
    }
    peopleByBooking.set(booking.id, people);
  }
  for (const traveler of travelers || []) {
    const list = peopleByBooking.get(traveler.booking_id) || [];
    list.push({ first_name: traveler.first_name || "", last_name: traveler.last_name || "" });
    peopleByBooking.set(traveler.booking_id, list);
  }
  const itemsByBooking = new Map<string, NonNullable<typeof items>>();
  for (const item of items || []) {
    const list = itemsByBooking.get(item.booking_id) || [];
    list.push(item);
    itemsByBooking.set(item.booking_id, list);
  }
  return (bookings || []).map((booking) =>
    tripDossierFromRows({
      booking,
      items: itemsByBooking.get(booking.id) || [],
      people: peopleByBooking.get(booking.id) || [],
    })
  );
}

/** Après le parse : un seul dossier caché, avec les cartes et les voyageurs. Aucun message. */
export async function organizeInboundMail(id: string) {
  const admin = createServiceClient();
  const { data } = await admin.from("crm_email_ingest").select("*").eq("id", id).maybeSingle();
  if (!data) return { attached: false, bookingId: null };
  const row = data as CrmEmailIngest;
  if (row.status !== "parsed" && row.status !== "matched") return { attached: false, bookingId: null };
  if (row.created_booking_id) return { attached: false, bookingId: row.created_booking_id };
  const extract = parseExtractPayloadSafe(row.extract);
  const warnings = Array.isArray(row.warnings) ? row.warnings : [];
  const unreadTicket = warnings.some((warning) => warning.message === "Le billet électronique n’a pas pu être lu.");
  let dossiers: TripDossier[] = [];
  let suppressions: Awaited<ReturnType<typeof loadSuppressions>> = [];
  try {
    [dossiers, suppressions] = await Promise.all([loadDossiers(admin), loadSuppressions(admin)]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Le séjour n’a pas pu être constitué.";
    await admin.from("crm_email_ingest").update({ error: message }).eq("id", id);
    return { attached: false, bookingId: null };
  }
  const plan = planInboxOrganization({
    extract,
    fromEmail: row.from_email,
    dossiers,
    suppressions,
    customerId: row.suggested_customer_id,
    unreadTicket,
  });
  try {
    const handlers: InboxHandlers = {
      ensureCompanions: (customerId, people) => ensureCompanions(admin, customerId, people),
      findCustomerByName: async (firstName, lastName) => {
        const { data: named } = await admin.from("crm_customers").select("id, first_name, last_name").ilike("last_name", lastName);
        const hits = (named || []).filter(
          (person) => fold(person.first_name) === fold(firstName) && fold(person.last_name) === fold(lastName)
        );
        if (hits.length > 1) return "several";
        return (hits[0]?.id as string | undefined) || null;
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
        if (error?.code === "23505" && input.email) {
          const { data: existing } = await admin.from("crm_customers").select("id").eq("email", input.email).maybeSingle();
          if (existing?.id) return existing.id as string;
        }
        if (error || !created?.id) throw new Error("Création de la fiche impossible.");
        return created.id as string;
      },
      persist: async (customerId, next) => {
        const { loadEmailIngestFiles } = await import("@/lib/crm/email-ingest");
        const { persistNewBookingFromExtract } = await import("@/lib/crm/ingest-booking");
        const files = await loadEmailIngestFiles(row);
        const booking = await persistNewBookingFromExtract({
          customerId,
          extract: next,
          files,
          status: "draft",
          visibleToClient: false,
          emailIngestId: row.id,
        });
        await admin
          .from("crm_bookings")
          .update({ visible_to_client: false, status: "draft", notes_client: null })
          .eq("id", booking.id);
        return { id: booking.id };
      },
      apply: async (bookingId, customerId, next) => {
        const { loadEmailIngestFiles } = await import("@/lib/crm/email-ingest");
        const { applyReplacementToBooking } = await import("@/lib/crm/ingest-booking");
        const files = await loadEmailIngestFiles(row);
        await applyReplacementToBooking({
          bookingId,
          customerId,
          extract: next,
          files,
          visibleToClient: false,
          emailIngestId: row.id,
        });
      },
      merge: (keepId, dropId) => mergeDossierInto(admin, keepId, dropId),
      markAttached: async (bookingId, customerId, created) => {
        await admin
          .from("crm_email_ingest")
          .update({
            status: "attached",
            suggested_booking_id: bookingId,
            suggested_customer_id: customerId,
            created_booking_id: created ? bookingId : row.created_booking_id,
            error: null,
          })
          .eq("id", row.id);
      },
      hold: async (message) => {
        if (warnings.some((warning) => warning.message === message)) return;
        await admin
          .from("crm_email_ingest")
          .update({ warnings: [...warnings, { file: "séjour", message }], error: null })
          .eq("id", row.id);
      },
    };
    return await executeInboxPlan(plan, extract, handlers);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Le séjour n’a pas pu être constitué.";
    await admin.from("crm_email_ingest").update({ error: message }).eq("id", id);
    return { attached: false, bookingId: null };
  }
}
