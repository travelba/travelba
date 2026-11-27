import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionWindowOpenNow } from "./whatsapp-inbox";
import { notifyTrainBot } from "./train-bot";
import { availableTrainFares } from "./train-fares";
import { planTrainCombinations, trainGreeting, TRAIN_BILLET_ENV, type TrainOffer } from "./train-whatsapp";
import { deliverTrainPlan } from "./train-send";
import { planTrainDesk, type TrainDeskAction, type TrainDeskRow } from "./train-desk";
import { productionOnlySecret } from "./preview-secrets";
import { sendContentTemplate } from "./whatsapp";
import { freeMessageSignedPath } from "./free-message-link";

export async function loadTrainDeskRow(admin: SupabaseClient, id: string, bookingId?: string) {
  let query = admin.from("crm_train_requests").select("*").eq("id", id);
  if (bookingId) query = query.eq("booking_id", bookingId);
  const { data, error } = await query.maybeSingle();
  if (error?.code === "42P01") return { error: "La migration des demandes de train n’est pas appliquée." as const };
  if (error || !data) return { error: "Demande introuvable." as const };
  return { row: data as TrainDeskRow & { customer_id: string } };
}

export async function runTrainDesk(
  admin: SupabaseClient,
  row: TrainDeskRow & { customer_id: string },
  action: TrainDeskAction,
  extra: { texte?: string; ia?: boolean | null; aller_date?: string; retour_date?: string; aller_creneau?: string; retour_creneau?: string; envoyer?: boolean }
) {
  const [{ data: person }, { data: last }] = await Promise.all([
    admin.from("crm_customers").select("first_name, phone").eq("id", row.customer_id).maybeSingle(),
    admin.from("crm_whatsapp_messages").select("created_at").eq("customer_id", row.customer_id).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1),
  ]);
  const prenom = (person as { first_name?: string | null } | null)?.first_name || "";
  const phone = (person as { phone?: string | null } | null)?.phone || "";
  const inbound = ((last || []) as { created_at?: string }[])[0]?.created_at || null;
  const plan = planTrainDesk(row, action, { ...extra, prenom, sessionOuverte: sessionWindowOpenNow(inbound) });
  if (action === "ia_globale") {
    if (!extra.envoyer) return { ...plan, envoye: false as const };
    const actif = extra.ia !== false;
    const existing = await admin.from("crm_integrations").select("id").eq("provider", "train-ia").maybeSingle();
    const id = (existing.data as { id?: string } | null)?.id;
    if (id) await admin.from("crm_integrations").update({ extra: { actif }, updated_at: new Date().toISOString() }).eq("id", id);
    else await admin.from("crm_integrations").insert({ provider: "train-ia", extra: { actif } });
    return { ...plan, envoye: false as const };
  }
  if (!extra.envoyer) return { ...plan, envoye: false as const };
  const { error } = await admin.from("crm_train_requests").update({ ...plan.patch, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (error) return { ...plan, envoye: false as const, raison: "Enregistrement impossible." };
  if (plan.bot) await notifyTrainBot({ evenement: plan.bot, demande_id: row.id, dossier_id: row.booking_id });
  if (typeof plan.patch.status === "string") {
    const { syncServiceCardStatus } = await import("./service-request");
    await syncServiceCardStatus(admin, row.id, plan.patch.status);
  }
  let raison = "";
  if (phone && plan.envoie === "accroche") {
    const sent = await deliverTrainPlan({
      phone,
      plan: planTrainAccroche({ prenom: trainGreeting({ firstName: prenom }), route: `${row.depart_ville} → ${row.arrivee_ville}` }),
    });
    if (!sent.ok) raison = sent.raison;
  } else if (phone && (plan.envoie === "rappel" || plan.envoie === "message") && plan.texte) {
    const sent = await deliverTrainPlan({ phone, plan: { modele: "session", corps: plan.texte } });
    if (!sent.ok) raison = sent.raison;
  } else if (phone && plan.envoie === "tarifs") {
    const aller = row.choix_aller == null ? null : row.aller[row.choix_aller];
    const retour = row.choix_retour == null ? null : row.retour[row.choix_retour];
    const fares = availableTrainFares([aller, retour].filter(Boolean) as TrainOffer[]);
    if (fares.length > 1) {
      const sent = await deliverTrainPlan({ phone, plan: planTrainCombinations(fares) });
      if (!sent.ok) raison = sent.raison;
    } else raison = "Un seul tarif : rien à renvoyer.";
  } else if (plan.envoie === "billets") {
    raison = await resendTrainTicket(admin, row, phone);
  }
  return { ...plan, envoye: !raison, ...(raison ? { raison } : {}) };
}

function planTrainAccroche(input: { prenom: string; route: string }) {
  const variables = { "1": input.prenom || "toi", "2": input.route };
  const corps = ["Bonjour " + variables["1"] + ",", "", "J’ai des horaires de train pour " + variables["2"] + ".", "Réponds ici, je te les montre."].join("\n");
  return { modele: "train_accroche" as const, corps, variables, boutons: [{ title: "Voir les horaires", id: "train:liste" }] };
}

async function resendTrainTicket(admin: SupabaseClient, row: TrainDeskRow, phone: string) {
  const sid = productionOnlySecret(process.env[TRAIN_BILLET_ENV]);
  if (!sid) return "Modèle de billet absent.";
  if (!phone) return "Téléphone absent.";
  const { data } = await admin
    .from("crm_booking_documents")
    .select("id, file_name")
    .eq("booking_id", row.booking_id)
    .eq("kind", "billet de train")
    .order("created_at", { ascending: false })
    .limit(1);
  const doc = ((data || []) as { id: string; file_name: string | null }[])[0];
  if (!doc) return "Aucun billet déposé.";
  const file = doc.file_name || "billet-train.pdf";
  const media = freeMessageSignedPath(doc.id, file.endsWith(".pdf") ? file : "billet-train.pdf", Date.now());
  if (!media) return "Lien du billet indisponible.";
  const sent = await sendContentTemplate({
    phone,
    contentSid: sid,
    variables: {
      "1": "voyageur",
      "2": "train",
      "3": `${row.depart_ville} → ${row.arrivee_ville}`,
      "4": "la date indiquée sur le billet",
      "5": "indiqué sur le billet",
      "6": media,
    },
  });
  return sent.ok ? "" : "Envoi refusé.";
}
