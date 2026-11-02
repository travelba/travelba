import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import { countInboxCards } from "@/lib/crm/email-thread";
import { EMAIL_INBOX_QUEUE_STATUSES } from "@/lib/crm/types";
import { isoDateInDays } from "@/lib/crm/money";
import { foldThreads, unreadThreadCount, type InboxMessage } from "@/lib/crm/whatsapp-inbox";
import { loadRecentWhatsappRows } from "@/lib/crm/whatsapp-dock-load";

export type AdminBadges = {
  /** Virements Revolut reçus, pas encore rapprochés. */
  revolut: number;
  /** Paiements Stripe reçus, pas encore rapprochés. */
  stripe: number;
  /** Mails fournisseurs dans la file de relecture. */
  emails: number;
  /** Réservations Little Emperors sans dossier. */
  le: number;
  /** Pièces d’identité qui expirent entre aujourd’hui et 90 jours. Les déjà expirées n’entrent pas. */
  pieces: number;
  /** Fils WhatsApp avec un message client non lu. */
  whatsapp: number;
  /** Courriers hôtel où l’hôtel a écrit en dernier : une réponse à traiter. */
  hotels: number;
  /** Sorties Pliant et débits Revolut pas encore pointés sur un dossier. */
  costs: number;
};

export const EMPTY_ADMIN_BADGES: AdminBadges = {
  revolut: 0,
  stripe: 0,
  emails: 0,
  le: 0,
  pieces: 0,
  whatsapp: 0,
  hotels: 0,
  costs: 0,
};

/**
 * Les compteurs du menu et du tableau de bord, comptés une fois par requête
 * (`cache()` de React, comme `getSessionUser`) : le layout et la page partagent le résultat.
 */
export const adminBadges = cache(async (): Promise<AdminBadges> => {
  try {
    const admin = createServiceClient();
    const [revolut, stripe, emails, le, pieces, whatsappRows, hotels, pliantCosts, revolutCosts] = await Promise.all([
      admin
        .from("crm_revolut_transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "unmatched")
        .eq("direction", "credit"),
      admin
        .from("crm_stripe_transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "unmatched")
        .eq("direction", "credit"),
      emailInboxCount(admin),
      admin.from("crm_le_bookings").select("id", { count: "exact", head: true }).eq("status", "unmatched"),
      admin
        .from("crm_travel_documents")
        .select("id", { count: "exact", head: true })
        .not("expires_on", "is", null)
        .gte("expires_on", isoDateInDays(0))
        .lte("expires_on", isoDateInDays(90)),
      loadRecentWhatsappRows(),
      admin.from("crm_hotel_requests").select("id", { count: "exact", head: true }).eq("status", "replied"),
      admin
        .from("crm_pliant_transactions")
        .select("id", { count: "exact", head: true })
        .eq("match_status", "unmatched")
        .in("status", ["BOOKED", "CONFIRMED"])
        .in("type", ["PURCHASE", "CASH_WITHDRAWAL", "REFUND", "CHARGEBACK"]),
      admin
        .from("crm_revolut_transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "unmatched")
        .eq("direction", "debit"),
    ]);
    const whatsapp = whatsappRows || (await fallbackWhatsappRows(admin));
    return {
      revolut: revolut.error ? 0 : revolut.count ?? 0,
      stripe: stripe.error ? 0 : stripe.count ?? 0,
      emails,
      le: le.error ? 0 : le.count ?? 0,
      pieces: pieces.error ? 0 : pieces.count ?? 0,
      whatsapp: unreadWhatsapp(whatsapp),
      hotels: hotels.error ? 0 : hotels.count ?? 0,
      costs: (pliantCosts.error ? 0 : pliantCosts.count ?? 0) + (revolutCosts.error ? 0 : revolutCosts.count ?? 0),
    };
  } catch (err) {
    console.error("[admin/badges]", err instanceof Error ? err.message : err);
    return EMPTY_ADMIN_BADGES;
  }
});

/** Une carte par fil. Si les colonnes de regroupement manquent encore, le décompte brut. */
async function emailInboxCount(admin: ReturnType<typeof createServiceClient>) {
  const grouped = await admin
    .from("crm_email_ingest")
    .select("id, gmail_thread_id, confirmation_refs, grouped_into, extract, received_at")
    .in("status", [...EMAIL_INBOX_QUEUE_STATUSES])
    .limit(800);
  if (!grouped.error) return countInboxCards(grouped.data || []);
  const head = await admin
    .from("crm_email_ingest")
    .select("id", { count: "exact", head: true })
    .in("status", [...EMAIL_INBOX_QUEUE_STATUSES]);
  return head.error ? 0 : head.count ?? 0;
}

async function fallbackWhatsappRows(admin: ReturnType<typeof createServiceClient>) {
  const whatsapp = await admin
    .from("crm_whatsapp_messages")
    .select("id, phone, customer_id, direction, body, created_at, status")
    .order("created_at", { ascending: false })
    .limit(400);
  return whatsapp.error ? [] : whatsapp.data || [];
}

function unreadWhatsapp(
  rows: {
    id: string;
    phone?: string | null;
    customer_id: string | null;
    direction: string;
    body: string;
    created_at: string;
    status: string | null;
  }[]
) {
  const messages: InboxMessage[] = rows.map((row) => ({
    id: row.id,
    phone: row.phone ?? null,
    customerId: row.customer_id,
    customerName: null,
    bookingId: null,
    bookingReference: null,
    direction: row.direction === "inbound" ? "inbound" : "outbound",
    body: row.body,
    createdAt: row.created_at,
    status: row.status,
    templateKey: null,
    authorName: null,
    mediaPath: null,
    tools: [],
    requestId: null,
  }));
  return unreadThreadCount(foldThreads(messages, {}));
}
