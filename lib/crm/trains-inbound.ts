import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneFromWhatsapp } from "./whatsapp-inbound";
import { notifyTrainBot, trainBotEventsForTurn } from "./train-bot";
import { askTrainAssistant, openAiKey } from "./train-assistant";
import { appendTrainJournal, trainAutomationOff, trainIaEnabled } from "./train-journal";
import { availableTrainFares } from "./train-fares";
import { nextTrainTurn, planTrainCombinations, trainGreeting, type TrainChoiceState, type TrainOffer } from "./train-whatsapp";
import { deliverTrainPlan } from "./train-send";

type RequestRow = TrainChoiceState & {
  id: string;
  booking_id: string;
  customer_id: string;
  depart_ville: string;
  arrivee_ville: string;
  voyageur_ids: string[];
  placement: string;
  pause?: boolean | null;
  prise_en_main?: boolean | null;
  ia?: boolean | null;
  journal?: unknown;
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
  if (trainAutomationOff(row)) return { handled: true as const, action: "pause" as const };
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
  if (turn.action === "ignorer") {
    const answered = await answerTrainWithAssistant(admin, row, customer.first_name, params.get("Body") || "", phone);
    return answered ? { handled: true as const, action: "ia" as const } : { handled: false as const };
  }
  await admin
    .from("crm_train_requests")
    .update({ ...turn.patch, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (typeof turn.patch.status === "string") {
    const { syncServiceCardStatus } = await import("./service-request");
    await syncServiceCardStatus(admin, row.id, turn.patch.status);
  }
  if (turn.action === "suite" && turn.suite) {
    await admin.from("crm_train_requests").update({ suite: turn.suite }).eq("id", row.id);
  }
  const botExtra: { contrainte?: string; suite?: string } = {};
  if (turn.action === "contrainte") botExtra.contrainte = turn.contrainte;
  if (turn.action === "suite") botExtra.suite = turn.suite;
  for (const evenement of trainBotEventsForTurn(turn)) {
    await notifyTrainBot({ evenement, demande_id: row.id, dossier_id: row.booking_id, ...botExtra });
  }
  if (phone) await deliverTrainPlan({ phone, plan: turn.plan });
  return { handled: true as const, action: turn.action };
}

async function trainIaGlobal(admin: SupabaseClient) {
  const { data } = await admin.from("crm_integrations").select("extra").eq("provider", "train-ia").maybeSingle();
  return Boolean((data as { extra?: { actif?: boolean } } | null)?.extra?.actif);
}

async function answerTrainWithAssistant(admin: SupabaseClient, row: RequestRow, firstName: string | null, message: string, phone: string) {
  const enabled = trainIaEnabled({
    key: openAiKey(),
    globalOn: await trainIaGlobal(admin),
    ia: row.ia ?? null,
    pause: row.pause,
    prise_en_main: row.prise_en_main,
  });
  if (!enabled || !message.trim()) return false;
  const reply = await askTrainAssistant({
    prenom: trainGreeting({ firstName }),
    trajet: `${row.depart_ville} → ${row.arrivee_ville}`,
    etat: row.status,
    message,
  });
  if (!reply.actif || !reply.texte) return false;
  const journal = appendTrainJournal(row.journal, { at: new Date().toISOString(), texte: reply.texte, ia: true, kind: reply.geste });
  const patch: Record<string, unknown> = { journal, updated_at: new Date().toISOString() };
  if (reply.geste === "agence") patch.besoin_agence = true;
  if (reply.geste === "relance") patch.status = "en_attente";
  if (reply.geste === "horaires") {
    patch.status = "recherche";
    patch.step = "aller";
    patch.choix_aller = null;
    patch.choix_retour = null;
    patch.classe = null;
    patch.tarif = null;
  }
  if (reply.geste === "reproposer") {
    patch.step = "tarif";
    patch.classe = null;
    patch.tarif = null;
    patch.status = "propositions";
  }
  await admin.from("crm_train_requests").update(patch).eq("id", row.id);
  if (reply.geste === "agence") await notifyTrainBot({ evenement: "agence", demande_id: row.id, dossier_id: row.booking_id });
  if (reply.geste === "relance") await notifyTrainBot({ evenement: "relance", demande_id: row.id, dossier_id: row.booking_id });
  if (reply.geste === "horaires") {
    await notifyTrainBot({ evenement: "contrainte", demande_id: row.id, dossier_id: row.booking_id, contrainte: reply.contrainte || message.slice(0, 80) });
  }
  const aller = row.choix_aller == null ? null : (row.aller || [])[row.choix_aller];
  const retour = row.choix_retour == null ? null : (row.retour || [])[row.choix_retour];
  const fares = availableTrainFares([aller, retour].filter(Boolean) as TrainOffer[]);
  if (phone && reply.geste === "reproposer" && fares.length > 1) {
    await deliverTrainPlan({ phone, plan: planTrainCombinations(fares) });
  } else if (phone) {
    await deliverTrainPlan({ phone, plan: { modele: "session", corps: reply.texte } });
  }
  return true;
}
