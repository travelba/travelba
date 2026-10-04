import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import { EMAIL_INBOX_QUEUE_STATUSES } from "@/lib/crm/types";

export type AdminBadges = {
  /** Virements Revolut reçus, pas encore rapprochés. */
  revolut: number;
  /** Mails fournisseurs dans la file de relecture. */
  emails: number;
  /** Réservations Little Emperors sans dossier. */
  le: number;
};

export const EMPTY_ADMIN_BADGES: AdminBadges = { revolut: 0, emails: 0, le: 0 };

/**
 * Les trois compteurs du menu et du tableau de bord, comptés une fois par requête
 * (`cache()` de React, comme `getSessionUser`) : le layout et la page partagent le résultat.
 */
export const adminBadges = cache(async (): Promise<AdminBadges> => {
  try {
    const admin = createServiceClient();
    const [revolut, emails, le] = await Promise.all([
      admin
        .from("crm_revolut_transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "unmatched")
        .eq("direction", "credit"),
      admin
        .from("crm_email_ingest")
        .select("id", { count: "exact", head: true })
        .in("status", [...EMAIL_INBOX_QUEUE_STATUSES]),
      admin.from("crm_le_bookings").select("id", { count: "exact", head: true }).eq("status", "unmatched"),
    ]);
    return {
      revolut: revolut.error ? 0 : revolut.count ?? 0,
      emails: emails.error ? 0 : emails.count ?? 0,
      le: le.error ? 0 : le.count ?? 0,
    };
  } catch (err) {
    console.error("[admin/badges]", err instanceof Error ? err.message : err);
    return EMPTY_ADMIN_BADGES;
  }
});
