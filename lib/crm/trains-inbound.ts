import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneFromWhatsapp } from "./whatsapp-inbound";
import { notifyTrainBot } from "./train-bot";
import { nextTrainTurn, trainGreeting, type TrainChoiceState, type TrainOffer } from "./train-whatsapp";
import { deliverTrainPlan } from "./train-send";

type RequestRow = TrainChoiceState & {
  id: string;
  booking_id: string;
  customer_id: string;
  depart_ville: string;
  arrivee_ville: string;
  voyageur_ids: string[];
  placement: string;
};

function missing(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));
}

/** Réponse WhatsApp d’une demande de train ouverte. Sinon le Concierge continue. */
export async function captureTrainReply(admin: SupabaseClient, params: URLSearchParams) {
  const phone = phoneFromWhatsapp(params.get("From"));
  if (!phone) return { handled: false as const };
  const [primary, secondary] = await Promise.all([
    admin.from("crm_customers").select("id, first_name, last_name, sex").eq("phone", phone),
    admin.from("crm_customers").select("id, first_name, last_name, sex").eq("phone_secondary", phone),
  ]);
  if (missing(primary.error) || missing(secondary.error)) return { handled: false as const };
  const people = [...(primary.data || []), ...(secondary.data || [])] as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    sex: string | null;
  }[];
  const unique = new Map(people.map((person) => [person.id, person]));
  if (unique.size !== 1) return { handled: false as const };
  const customer = [...unique.values()][0];
  const open = await admin
    .from("crm_train_requests")
    .select("*")
    .eq("customer_id", customer.id)
    .in("status", ["propositions", "en_attente", "prix_a_reconfirmer", "commande"])
    .order("updated_at", { ascending: false })
    .limit(1);
  if (missing(open.error) || !open.data?.length) return { handled: false as const };
  const row = open.data[0] as RequestRow;
  const turn = nextTrainTurn({
    state: {
      status: row.status,
      step: row.step,
      aller: (row.aller || []) as TrainOffer[],
      retour: (row.retour || []) as TrainOffer[],
      choix_aller: row.choix_aller,
      choix_retour: row.choix_retour,
      classe: row.classe,
      tarif: row.tarif,
      ambigu_compte: row.ambigu_compte,
      besoin_agence: row.besoin_agence,
      horaire_leg: row.horaire_leg,
    },
    greeting: trainGreeting(customer),
    depart: row.depart_ville,
    arrivee: row.arrivee_ville,
    body: params.get("Body"),
    buttonPayload: params.get("ListId") || params.get("ButtonPayload"),
    sessionOpen: true,
    voyageurs: row.voyageur_ids?.length || 1,
    placement: row.placement,
  });
  if (turn.action === "ignorer") return { handled: false as const };
  await admin
    .from("crm_train_requests")
    .update({ ...turn.patch, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (typeof turn.patch.status === "string") {
    const { syncServiceCardStatus } = await import("./service-request");
    await syncServiceCardStatus(admin, row.id, turn.patch.status);
  }
  if (turn.action === "choix") {
    await notifyTrainBot({ evenement: "choix_recu", demande_id: row.id, dossier_id: row.booking_id });
  } else if (turn.action === "contrainte") {
    await notifyTrainBot({ evenement: "contrainte", demande_id: row.id, dossier_id: row.booking_id, contrainte: turn.contrainte });
  } else if (turn.action === "reprise") {
    await notifyTrainBot({ evenement: "prix_a_reconfirmer", demande_id: row.id, dossier_id: row.booking_id });
  } else if (turn.action === "refuse") {
    await notifyTrainBot({ evenement: "refus", demande_id: row.id, dossier_id: row.booking_id });
  } else if (turn.action === "suite") {
    await admin.from("crm_train_requests").update({ suite: turn.suite }).eq("id", row.id);
    await notifyTrainBot({ evenement: "suite", demande_id: row.id, dossier_id: row.booking_id, suite: turn.suite });
  }
  if (phone) await deliverTrainPlan({ phone, plan: turn.plan });
  return { handled: true as const, action: turn.action };
}
