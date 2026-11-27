import type { SupabaseClient } from "@supabase/supabase-js";
import { freeMessageSignedPath } from "./free-message-link";
import { productionOnlySecret } from "./preview-secrets";
import { TRAIN_BILLET_ENV, formatTrainDateFr, trainClock, trainRouteLabel } from "./train-whatsapp";
import { trainTicketSendWindow } from "./train-ticket-plan";
import { sendContentTemplate } from "./whatsapp";

type Offer = { date?: string; heure_depart?: string; heure_arrivee?: string; numero?: string; depart_gare?: string; arrivee_gare?: string };

export async function runMorningTrainTickets(
  admin: SupabaseClient,
  options?: { now?: Date; send?: typeof sendContentTemplate }
) {
  const now = options?.now || new Date();
  const sid = productionOnlySecret(process.env[TRAIN_BILLET_ENV]);
  if (!sid) return { dus: 0, envoyes: 0, raison: `${TRAIN_BILLET_ENV} absente` };
  const { data, error } = await admin
    .from("crm_train_requests")
    .select("id, booking_id, customer_id, aller, retour, choix_aller, choix_retour, billets_envoyes")
    .eq("status", "commande")
    .limit(40);
  if (error) return { dus: 0, envoyes: 0, raison: error.code === "42P01" ? "migration" : "lecture" };
  const send = options?.send || sendContentTemplate;
  let dus = 0;
  let envoyes = 0;
  for (const row of data || []) {
    const record = row as {
      id: string;
      booking_id: string;
      customer_id: string;
      aller: Offer[];
      retour: Offer[];
      choix_aller: number | null;
      choix_retour: number | null;
      billets_envoyes: string[] | null;
    };
    const legs = [record.aller?.[record.choix_aller ?? -1], record.retour?.[record.choix_retour ?? -1]].filter(Boolean) as Offer[];
    const sentDays = new Set(record.billets_envoyes || []);
    for (const offer of legs) {
      if (!offer.date || !offer.heure_depart || sentDays.has(offer.date)) continue;
      const window = trainTicketSendWindow({
        departureLocal: `${offer.date}T${offer.heure_depart}:00`,
        timeZone: "Europe/Paris",
        now: now.getTime(),
      });
      if (!window?.due) continue;
      dus += 1;
      const [{ data: customer }, { data: docs }] = await Promise.all([
        admin.from("crm_customers").select("first_name, phone, whatsapp_opt_in_at, whatsapp_opt_out_at").eq("id", record.customer_id).maybeSingle(),
        admin.from("crm_booking_documents").select("id, file_name").eq("booking_id", record.booking_id).eq("kind", "billet de train").order("created_at", { ascending: false }).limit(1),
      ]);
      const phone = (customer as { phone?: string | null; whatsapp_opt_out_at?: string | null; whatsapp_opt_in_at?: string | null } | null)?.phone;
      const optedOut = Boolean((customer as { whatsapp_opt_out_at?: string | null } | null)?.whatsapp_opt_out_at);
      const optedIn = Boolean((customer as { whatsapp_opt_in_at?: string | null } | null)?.whatsapp_opt_in_at);
      const doc = ((docs || []) as { id: string; file_name: string | null }[])[0];
      const file = doc?.file_name || "billet-train.pdf";
      const media = doc ? freeMessageSignedPath(doc.id, file.endsWith(".pdf") ? file : "billet-train.pdf", now.getTime()) : null;
      if (!phone || optedOut || !optedIn || !media) continue;
      const sent = await send({
        phone,
        contentSid: sid,
        variables: {
          "1": ((customer as { first_name?: string | null } | null)?.first_name || "voyageur").slice(0, 40),
          "2": `train ${offer.numero || ""}`.trim(),
          "3": trainRouteLabel(offer.depart_gare || "", offer.arrivee_gare || ""),
          "4": `${formatTrainDateFr(offer.date)} à ${trainClock(offer.heure_depart) || offer.heure_depart}`,
          "5": "indiqué sur le billet",
          "6": media,
        },
      });
      if (!sent.ok) continue;
      envoyes += 1;
      sentDays.add(offer.date);
      await admin.from("crm_train_requests").update({ billets_envoyes: [...sentDays], updated_at: new Date().toISOString() }).eq("id", record.id);
    }
  }
  return { dus, envoyes };
}
