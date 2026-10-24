import type { SupabaseClient } from "@supabase/supabase-js";
import { planFollowups } from "./concierge-journey";
import { factsFromDossier, TOUCHPOINT_KINDS, touchpointDay, touchpointWindow } from "./concierge-touchpoints";
import { buildConciergeDossier, proactiveWhatsappAllowed } from "./whatsapp-concierge";
import { toE164 } from "./phone";

type Admin = SupabaseClient;

/**
 * Écrit les brouillons veille / arrivée / retour. N’envoie rien.
 * Un brouillon déjà envoyé n’est pas réouvert.
 */
export async function draftConciergeTouchpoints(admin: Admin, now = new Date()) {
  const { today, tomorrow } = touchpointWindow(now);
  const loaded = await admin
    .from("crm_bookings")
    .select("id, customer_id, reference, title, destination, start_date, end_date, currency, total_amount, visible_to_client, cover_image_path")
    .eq("visible_to_client", true)
    .or(`and(start_date.lte.${today},end_date.gte.${today}),start_date.eq.${tomorrow}`)
    .order("start_date")
    .limit(40);
  if (loaded.error) {
    console.error("[concierge] brouillons", loaded.error.code || "error");
    return { drafted: 0 };
  }
  const bookings = (loaded.data || []) as {
    id: string;
    customer_id: string;
    reference: string;
    title: string | null;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
    currency: string | null;
    total_amount: number | null;
    visible_to_client: boolean;
    cover_image_path: string | null;
  }[];
  if (!bookings.length) return { drafted: 0 };

  const bookingIds = bookings.map((row) => row.id);
  const customerIds = [...new Set(bookings.map((row) => row.customer_id))];
  const [customers, items, documents] = await Promise.all([
    admin
      .from("crm_customers")
      .select("id, first_name, phone, language, whatsapp_opt_in_at, whatsapp_opt_out_at")
      .in("id", customerIds),
    admin
      .from("crm_booking_items")
      .select("id, booking_id, kind, title, supplier, start_at, end_at, details, visible_to_client")
      .in("booking_id", bookingIds),
    admin.from("crm_travel_documents").select("customer_id, doc_type, first_name, last_name, expires_on").in("customer_id", customerIds),
  ]);
  if (customers.error || items.error || documents.error) {
    console.error("[concierge] brouillons", customers.error?.code || items.error?.code || documents.error?.code || "error");
    return { drafted: 0 };
  }

  const people = new Map(
    ((customers.data || []) as {
      id: string;
      first_name: string | null;
      phone: string | null;
      language: string | null;
      whatsapp_opt_in_at: string | null;
      whatsapp_opt_out_at: string | null;
    }[]).map((row) => [row.id, row])
  );
  const phones = [
    ...new Set(
      [...people.values()].flatMap((row) => {
        const phone = toE164(row.phone || "");
        return phone ? [phone] : [];
      })
    ),
  ];
  const inbound = phones.length
    ? await admin
        .from("crm_whatsapp_messages")
        .select("phone, created_at")
        .eq("direction", "inbound")
        .in("phone", phones)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [], error: null };
  if (inbound.error) {
    console.error("[concierge] brouillons", inbound.error.code || "error");
    return { drafted: 0 };
  }
  const lastInbound = new Map<string, string>();
  for (const row of (inbound.data || []) as { phone: string | null; created_at: string }[]) {
    if (row.phone && !lastInbound.has(row.phone)) lastInbound.set(row.phone, row.created_at);
  }

  const prior = phones.length
    ? await admin.from("crm_concierge_followups").select("phone, kind, slot, status").in("phone", phones)
    : { data: [], error: null };
  if (prior.error) {
    console.error("[concierge] brouillons", prior.error.code || "error");
    return { drafted: 0 };
  }
  const sent = new Set(
    ((prior.data || []) as { phone: string; kind: string; slot: string | null; status: string }[])
      .filter((row) => row.status === "sent")
      .map((row) => `${row.phone}|${row.kind}|${row.slot || ""}`)
  );

  const rows: Record<string, unknown>[] = [];
  for (const booking of bookings) {
    const person = people.get(booking.customer_id);
    const phone = toE164(person?.phone || "");
    if (!person || !phone || !proactiveWhatsappAllowed(person)) continue;
    const itemRows = ((items.data || []) as {
      id: string;
      booking_id: string;
      kind: string;
      title: string | null;
      supplier: string | null;
      start_at: string | null;
      end_at: string | null;
      details: Record<string, unknown> | null;
      visible_to_client: boolean | null;
    }[]).filter((item) => item.booking_id === booking.id);
    const papers = ((documents.data || []) as {
      customer_id: string;
      doc_type: "passport" | "visa" | "eta" | "id_card" | "insurance" | "other";
      first_name: string | null;
      last_name: string | null;
      expires_on: string | null;
    }[]).filter((doc) => doc.customer_id === booking.customer_id);
    const dossier = buildConciergeDossier({
      firstName: person.first_name,
      language: person.language,
      bookings: [
        {
          id: booking.id,
          reference: booking.reference,
          title: booking.title || "Séjour",
          destination: booking.destination,
          start_date: booking.start_date,
          end_date: booking.end_date,
          currency: booking.currency || "EUR",
          total_amount: Number(booking.total_amount) || 0,
          visible_to_client: true,
          cover_image_path: booking.cover_image_path,
        },
      ],
      items: itemRows.map((item) => ({
        id: item.id,
        booking_id: item.booking_id,
        kind: item.kind as NonNullable<Parameters<typeof buildConciergeDossier>[0]["items"]>[number]["kind"],
        title: item.title || "",
        supplier: item.supplier,
        start_at: item.start_at,
        end_at: item.end_at,
        amount: null,
        details: item.details || {},
        visible_to_client: item.visible_to_client !== false,
      })),
      travelDocuments: papers.map((doc) => ({
        doc_type: doc.doc_type,
        first_name: doc.first_name,
        last_name: doc.last_name,
        expires_on: doc.expires_on,
      })),
    });
    const touch = factsFromDossier(dossier, now);
    if (!touch) continue;
    const planned = planFollowups({
      now,
      lastInbound: lastInbound.get(phone) ? new Date(lastInbound.get(phone) as string) : null,
      stayStart: booking.start_date,
      stayEnd: booking.end_date,
      briefOpen: false,
      firstName: touch.firstName,
      stay: touch.stay,
      lang: touch.lang,
      facts: touch.facts,
      slot: booking.id,
      bookingId: booking.id,
    });
    for (const row of planned) {
      if (!TOUCHPOINT_KINDS.includes(row.kind as (typeof TOUCHPOINT_KINDS)[number])) continue;
      const slot = booking.id;
      if (sent.has(`${phone}|${row.kind}|${slot}`)) continue;
      rows.push({
        phone,
        customer_id: person.id,
        booking_id: booking.id,
        kind: row.kind,
        channel: row.channel,
        template_key: row.templateKey,
        draft_body: row.body,
        due_at: row.dueAt,
        status: "planned",
        slot,
      });
    }
  }

  if (rows.length) {
    const saved = await admin.from("crm_concierge_followups").upsert(rows, { onConflict: "phone,kind,slot" });
    if (saved.error) {
      console.error("[concierge] brouillons", saved.error.code || "error");
      return { drafted: 0 };
    }
  }

  const stale = await admin
    .from("crm_concierge_followups")
    .select("id, due_at")
    .eq("status", "planned")
    .in("kind", [...TOUCHPOINT_KINDS])
    .limit(80);
  if (!stale.error) {
    const todayCivil = touchpointDay(now);
    const ids = ((stale.data || []) as { id: string; due_at: string }[])
      .filter((row) => {
        const due = new Date(row.due_at);
        return Number.isNaN(due.getTime()) || touchpointDay(due) !== todayCivil;
      })
      .map((row) => row.id);
    if (ids.length) {
      await admin.from("crm_concierge_followups").update({ status: "skipped" }).in("id", ids).eq("status", "planned");
    }
  }
  return { drafted: rows.length };
}
