import { productionOnlySecret } from "./preview-secrets";
import { sendContentTemplate, twilioAcceptedSend, twilioFromNumber, twilioReady } from "./whatsapp";
import { sendWhatsappSession, sessionAddress } from "./whatsapp-session";
import {
  TRAIN_ACCORD_ENV,
  TRAIN_ACCROCHE_ENV,
  TRAIN_BILLET_ENV,
  TRAIN_CLASSE_ENV,
  TRAIN_TARIF_ENV,
  trainHorairesTemplateEnv,
  type TrainPlan,
} from "./train-whatsapp";

const MODIFIER_ENV = "TWILIO_CONTENT_TRAIN_MODIFIER";

function trainCount(plan: TrainPlan) {
  return (plan.boutons || []).filter((button) => button.id !== "train:horaires").length;
}

function contentEnv(plan: TrainPlan) {
  if (plan.modele === "train_accroche") return TRAIN_ACCROCHE_ENV;
  if (plan.modele === "train_horaires") {
    const count = trainCount(plan);
    const leg = plan.boutons?.some((button) => button.id.startsWith("train:retour:")) ? "retour" : "aller";
    return count >= 3 && count <= 9 ? trainHorairesTemplateEnv(count, leg) : "";
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
    if (input.plan.boutons?.length) {
      return sendSessionChoices({
        phone: input.phone,
        body: input.plan.corps,
        boutons: input.plan.boutons,
        liste: input.plan.liste,
        fetchImpl: input.fetchImpl,
      });
    }
    const to = sessionAddress(input.phone) || input.phone;
    const sent = await sendWhatsappSession({ to, body: input.plan.corps, fetchImpl: input.fetchImpl });
    if (sent.ok) return { ok: true as const, sid: sent.sid, via: "session" as const };
    return { ok: false as const, raison: sent.detail === "not_configured" ? "fenêtre ou Twilio absent" : "envoi refusé" };
  }
  return { ok: false as const, raison: `Variable ${env} absente. Rien n’est envoyé.` };
}

/** Boutons de session. Le contenu n’est pas soumis à Meta. Sans compte, aucun appel. */
async function sendSessionChoices(input: {
  phone: string;
  body: string;
  boutons: { title: string; id: string }[];
  liste?: string;
  fetchImpl?: typeof fetch;
}) {
  const sid = productionOnlySecret(process.env.TWILIO_ACCOUNT_SID);
  const token = productionOnlySecret(process.env.TWILIO_AUTH_TOKEN);
  const from = twilioFromNumber();
  if (!sid || !token || !from || !twilioReady()) return { ok: false as const, raison: "fenêtre ou Twilio absent" };
  const to = sessionAddress(input.phone);
  if (!to) return { ok: false as const, raison: "Téléphone absent" };
  const quick = input.boutons.length <= 3;
  const types = quick
    ? {
        "twilio/quick-reply": {
          body: input.body,
          actions: input.boutons.map((button) => ({ type: "QUICK_REPLY", title: button.title.slice(0, 20), id: button.id })),
        },
      }
    : {
        "twilio/list-picker": {
          body: input.body,
          button: (input.liste || "Voir les choix").slice(0, 20),
          items: input.boutons.slice(0, 10).map((button) => ({ item: button.title.slice(0, 24), id: button.id })),
        },
      };
  const fetchImpl = input.fetchImpl ?? fetch;
  const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
  let created: Response;
  try {
    created = await fetchImpl("https://content.twilio.com/v1/Content", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        friendly_name: `train_offre_${Date.now()}`,
        language: "fr",
        types,
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false as const, raison: "envoi refusé" };
  }
  const content = (await created.json().catch(() => null)) as { sid?: string } | null;
  const contentSid = content?.sid || "";
  if (!created.ok || !contentSid) return { ok: false as const, raison: "envoi refusé" };
  let sent: Response;
  try {
    sent = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: from, To: to, ContentSid: contentSid, ContentVariables: "{}" }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false as const, raison: "envoi refusé" };
  }
  const payload = (await sent.json().catch(() => null)) as { sid?: string; error_code?: number | null; status?: string } | null;
  if (!sent.ok) return { ok: false as const, raison: "envoi refusé" };
  const accepted = twilioAcceptedSend(payload);
  if (!accepted.ok) return { ok: false as const, raison: "envoi refusé" };
  return { ok: true as const, sid: accepted.sid, via: "session" as const };
}
