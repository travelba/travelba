import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { trainTicketSendWindow } from "@/lib/crm/train-ticket-plan";
import { createServiceClient } from "@/lib/supabase/admin";

/** Le matin du départ, ou deux heures avant si le train part tôt. Aucun envoi si Twilio n’est pas prêt. */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const admin = createServiceClient();
  const { data, error } = await admin.from("crm_train_requests").select("id, aller, choix_aller, billets_envoyes").eq("status", "commande").limit(40);
  if (error) return NextResponse.json({ pret: 0, raison: error.code === "42P01" ? "migration" : "lecture" });
  const now = Date.now();
  let dus = 0;
  for (const row of data || []) {
    const aller = (row.aller || []) as { date?: string; heure_depart?: string }[];
    const offer = aller[(row as { choix_aller?: number | null }).choix_aller ?? -1];
    if (!offer?.date || !offer.heure_depart) continue;
    const window = trainTicketSendWindow({
      departureLocal: `${offer.date}T${offer.heure_depart}:00`,
      timeZone: "Europe/Paris",
      now,
    });
    if (window?.due) dus += 1;
  }
  return NextResponse.json({ dus, envoie: false, note: "Le PDF part quand le modèle train_billet est approuvé." });
}
