import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Curseur de synchro, une ligne par fournisseur, à part du jeton.
 * Revolut, Stripe, Pliant et Twilio s’en servent.
 * Little Emperors : l’API ne filtre pas par date ; le cron ne réécrit que les séjours changés.
 *   La liste complète reste celle de l’outil MCP.
 * MB3M : FindAllPieces (factures et règlements, IncludePayments) ne prend pas de date. FindPayments n’existe pas.
 *   On ne réécrit une pièce ou un règlement que s’il a changé.
 * Qonto : pas de synchro de mouvements dans le CRM. Le nom sert au mode de règlement
 *   et aux virements internes. Rien à paginer.
 */
export const SYNC_WATERMARK = {
  revolut: "sync:revolut",
  stripe: "sync:stripe",
  pliant: "sync:pliant",
  twilio: "sync:twilio",
} as const;

export async function readSyncWatermark(provider: string): Promise<string | null> {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.from("crm_integrations").select("extra").eq("provider", provider).maybeSingle();
    if (error) return null;
    const extra = data?.extra;
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
    const value = (extra as Record<string, unknown>).synced_through;
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
    return value;
  } catch {
    return null;
  }
}

export async function writeSyncWatermark(provider: string, iso: string) {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.from("crm_integrations").select("id, extra").eq("provider", provider).maybeSingle();
    if (error) return;
    const extra =
      data?.extra && typeof data.extra === "object" && !Array.isArray(data.extra)
        ? { ...(data.extra as Record<string, unknown>) }
        : {};
    extra.synced_through = iso;
    if (data?.id) {
      await admin.from("crm_integrations").update({ extra, updated_at: iso }).eq("id", data.id);
      return;
    }
    await admin.from("crm_integrations").insert({ provider, extra });
  } catch (err) {
    console.error("[sync] curseur", provider, err instanceof Error ? err.message : "échec");
  }
}
