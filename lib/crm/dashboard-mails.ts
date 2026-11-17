import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardCourrier } from "./hotel-courrier-board";
import { hotelInboxActionCount, type HotelInbox, type HotelInboxRow } from "./hotel-inbox";
import { loadHotelInbox } from "./hotel-inbox-load";

export type DashboardMail = DashboardCourrier;

function toMail(row: HotelInboxRow, replyState: DashboardCourrier["replyState"]): DashboardMail {
  return {
    id: row.requestId,
    title: row.hotel,
    reference: row.reference,
    excerpt: row.excerpt,
    detail: [row.reference, row.excerpt.replace(/\n/g, " ")].filter(Boolean).join(" · "),
    receivedAt: row.activityAt,
    href: row.href,
    mark: row.kindLabel,
    replyState,
    replyLabel: row.status,
    lastWriter: row.lastWriter,
    followUpLabel: row.followUpLabel,
    paymentState: row.paymentState === "paid" || row.paymentState === "unpaid" ? row.paymentState : "hidden",
    paymentLabel: row.paymentState === "paid" ? row.paidLabel : row.paymentState === "unpaid" ? "À payer" : null,
  };
}

/** Même liste que l’onglet Hôtels : paiement, autres réponses, puis les envois sans réponse. */
export function dashboardMailsFromInbox(inbox: HotelInbox): DashboardMail[] {
  return [
    ...inbox.payment.map((row) => toMail(row, "treat")),
    ...inbox.replies.map((row) => toMail(row, "treat")),
    ...inbox.unanswered.map((row) => toMail(row, "silent")),
    ...inbox.waiting.map((row) => toMail(row, "waiting")),
  ];
}

/**
 * Courriers hôtel encore ouverts. Aucune écriture, aucun appel Gmail.
 * Le client est le service role : même lecture que la page Hôtels.
 */
export async function loadDashboardMails(supabase: SupabaseClient): Promise<DashboardMail[]> {
  return dashboardMailsFromInbox(await loadHotelInbox(supabase));
}

/** Pastille de l’onglet : paiement à faire et autres réponses. */
export async function countHotelRepliesToTreat(supabase: SupabaseClient) {
  return hotelInboxActionCount(await loadHotelInbox(supabase));
}
