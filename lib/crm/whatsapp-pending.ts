import { createServiceClient } from "@/lib/supabase/admin";
import { stayDestinationLine } from "@/lib/crm/stay-phrase";
import { dockDiscussionsHref, sessionWindowOpenNow } from "@/lib/crm/whatsapp-inbox";
import { loadWhatsappIndex } from "@/lib/crm/whatsapp-desk";

export type PendingDraft = {
  id: string;
  title: string;
  who: string;
  body: string;
  href: string;
  sendable: boolean;
  reason: string;
  /** Relance Concierge. Absent : lien vers le dossier (ESTA, ETA, proposition). */
  followupId?: string;
};

const DRAFT_LABEL: Record<string, string> = {
  predeparture: "Veille du départ",
  checkin: "Arrivée à l’hôtel",
  feedback: "Retour",
};

/** Brouillons à valider. Appelé quand la barre ouvre « À envoyer », pas à chaque page. */
export async function loadPendingDrafts(): Promise<PendingDraft[]> {
  try {
    const admin = createServiceClient();
    const index = await loadWhatsappIndex();
    const [followups, proposals, esta, uk] = await Promise.all([
      admin
        .from("crm_concierge_followups")
        .select("id, phone, kind, draft_body, status")
        .eq("status", "planned")
        .in("kind", ["predeparture", "checkin", "feedback"])
        .order("due_at", { ascending: true })
        .limit(30),
      admin.from("crm_concierge_proposals").select("id, phone, draft_body, status").eq("status", "pending").limit(20),
      admin.from("crm_esta_notices").select("id, booking_id, kind").is("emailed_at", null).order("created_at", { ascending: false }).limit(8),
      admin.from("crm_uk_eta_notices").select("id, booking_id, kind").is("emailed_at", null).order("created_at", { ascending: false }).limit(8),
    ]);
    const names = new Map(index.threads.map((row) => [row.phone || "", row.customerName]));
    const windowFor = (phone: string) => {
      const inbound = index.messages
        .filter((row) => row.phone === phone && row.direction === "inbound")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return sessionWindowOpenNow(inbound?.createdAt || null);
    };
    const drafts: PendingDraft[] = [];
    for (const row of (followups.error ? [] : followups.data || []) as {
      id: string;
      phone: string;
      kind: string;
      draft_body: string;
    }[]) {
      const open = windowFor(row.phone);
      drafts.push({
        id: `suivi-${row.id}`,
        followupId: row.id,
        title: DRAFT_LABEL[row.kind] || "Message",
        who: names.get(row.phone) || row.phone,
        body: row.draft_body,
        href: dockDiscussionsHref("tous", row.phone),
        sendable: open,
        reason: open ? "Fenêtre de 24 h ouverte." : "Hors fenêtre de 24 h. Le modèle n’est pas soumis.",
      });
    }
    for (const row of (proposals.error ? [] : proposals.data || []) as { id: string; phone: string; draft_body: string }[]) {
      drafts.push({
        id: `proposition-${row.id}`,
        title: "Proposition",
        who: names.get(row.phone) || row.phone,
        body: row.draft_body,
        href: dockDiscussionsHref("tous", row.phone),
        sendable: false,
        reason: "À approuver dans le fil. Rien ne part depuis cette liste.",
      });
    }
    const noticeBookings = [
      ...((esta.error ? [] : esta.data || []) as { id: string; booking_id: string; kind: string }[]).map((row) => ({
        ...row,
        title: row.kind === "valable" ? "ESTA" : "ESTA à relire",
      })),
      ...((uk.error ? [] : uk.data || []) as { id: string; booking_id: string; kind: string }[]).map((row) => ({
        ...row,
        title: row.kind === "valable" ? "ETA Royaume-Uni" : "ETA à relire",
      })),
    ];
    const bookingIds = [...new Set(noticeBookings.map((row) => row.booking_id))];
    const bookingRows = bookingIds.length
      ? await admin.from("crm_bookings").select("id, reference, title, destination").in("id", bookingIds)
      : { data: [] };
    const bookingLabel = new Map(
      ((bookingRows.data || []) as { id: string; reference: string; title: string | null; destination: string | null }[]).map((row) => [
        row.id,
        `${row.reference}${stayDestinationLine(row) ? ` · ${stayDestinationLine(row)}` : ""}`,
      ])
    );
    for (const row of noticeBookings) {
      drafts.push({
        id: `formalite-${row.id}`,
        title: row.title,
        who: bookingLabel.get(row.booking_id) || "Dossier",
        body: "Le message au client se relit sur le dossier, puis Envoyer au client.",
        href: `/admin/reservations/${row.booking_id}?onglet=client`,
        sendable: false,
        reason: "Le bouton du dossier respecte la fenêtre de 24 h.",
      });
    }
    return drafts;
  } catch (err) {
    console.error("[whatsapp-pending]", err instanceof Error ? err.message : "lecture");
    return [];
  }
}
