import { productionOnlySecret } from "./preview-secrets";
import { sendContentTemplate } from "./whatsapp";
import { sendWhatsappSession, sessionAddress } from "./whatsapp-session";
import {
  TRAIN_ACCORD_ENV,
  TRAIN_BILLET_ENV,
  TRAIN_CLASSE_ENV,
  TRAIN_TARIF_ENV,
  trainCarouselTemplateEnv,
  type TrainPlan,
} from "./train-whatsapp";

const MODIFIER_ENV = "TWILIO_CONTENT_TRAIN_MODIFIER";

function trainCount(plan: TrainPlan) {
  const cards = plan.carrousel?.types["twilio/carousel"].cards || [];
  return cards.filter((card) => card.actions[0]?.id !== "train:horaires").length;
}

function contentEnv(plan: TrainPlan) {
  if (plan.modele === "train_carrousel") {
    const count = trainCount(plan);
    return count >= 3 && count <= 9 ? trainCarouselTemplateEnv(count) : "";
  }
  if (plan.modele === "train_classe") return TRAIN_CLASSE_ENV;
  if (plan.modele === "train_tarif") return TRAIN_TARIF_ENV;
  if (plan.modele === "train_accord") return TRAIN_ACCORD_ENV;
  if (plan.modele === "train_modifier") return MODIFIER_ENV;
  if (plan.modele === "train_billet") return TRAIN_BILLET_ENV;
  return "";
}

/**
 * Envoi Twilio (API Messages, content SID). Sans variable ou sans compte, aucun appel.
 * Les textes de session (délai, refus, train complet) partent seulement si un fetch est fourni
 * ou si le compte est configuré : les tests passent un fetch factice, ou n’appellent pas cette fonction.
 */
export async function deliverTrainPlan(input: { phone: string; plan: TrainPlan; fetchImpl?: typeof fetch }) {
  const env = contentEnv(input.plan);
  const sid = env ? productionOnlySecret(process.env[env]) : "";
  if (sid && input.plan.variables) {
    const sent = await sendContentTemplate({
      phone: input.phone,
      contentSid: sid,
      variables: input.plan.variables,
      fetchImpl: input.fetchImpl,
    });
    if (sent.ok) return { ok: true as const, sid: sent.sid, via: "modele" as const };
    return { ok: false as const, raison: sent.reason === "not_configured" ? `Variable ${env} ou Twilio absent` : "envoi refusé" };
  }
  if (!env) {
    const to = sessionAddress(input.phone) || input.phone;
    const sent = await sendWhatsappSession({ to, body: input.plan.corps, fetchImpl: input.fetchImpl });
    if (sent.ok) return { ok: true as const, sid: sent.sid, via: "session" as const };
    return { ok: false as const, raison: sent.detail === "not_configured" ? "fenêtre ou Twilio absent" : "envoi refusé" };
  }
  return { ok: false as const, raison: `Variable ${env} absente. Rien n’est envoyé.` };
}
