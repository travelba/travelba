/**
 * Textes WhatsApp du contrôle ESTA / ETA Royaume-Uni.
 * Aucun numéro de passeport, aucun numéro de dossier d’autorisation.
 * Hors fenêtre de 24 h, le même texte part dans message_libre_texte
 * (le modèle ajoute « Bonjour » et « Le Concierge »).
 */

export type AuthorizationKind = "esta" | "uk_eta";

export type AuthorizationAlert = {
  title: string;
  body: string;
  /** question : priorité normale. urgent : prioritaire. */
  kind: "question" | "urgent";
  priority: "normale" | "prioritaire";
};

const NAME: Record<AuthorizationKind, string> = {
  esta: "ESTA",
  uk_eta: "ETA",
};

export function authorizationAutoSendEnabled(value?: string | null) {
  const flag = (value ?? process.env.ESTA_AUTO_WHATSAPP ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "oui";
}

export function authorizationDay(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Ce que le client lit dans la fenêtre de 24 h. */
export function authorizationClientText(input: {
  kind: AuthorizationKind;
  status: "approuve" | "introuvable" | "refuse";
  validUntil?: string | null;
}) {
  const name = NAME[input.kind];
  if (input.status === "approuve") {
    const date = authorizationDay(input.validUntil);
    return date
      ? `Bonne nouvelle, votre ${name} est approuvée, valable jusqu’au ${date}.`
      : `Bonne nouvelle, votre ${name} est approuvée.`;
  }
  if (input.status === "introuvable") {
    return `Je ne trouve pas de demande d’${name} avec le passeport que nous avons. Vérifiez si vous en avez fait une, et avec quel passeport. Sinon, il faut en faire une. L’agence peut vous aider.`;
  }
  return `Votre ${name} a été refusée. L’agence vous recontacte rapidement pour la suite, notamment une demande de visa.`;
}

export function authorizationAgencyAlert(input: {
  kind: AuthorizationKind;
  status: "introuvable" | "refuse" | "silence";
}): AuthorizationAlert {
  const name = NAME[input.kind];
  if (input.status === "refuse") {
    return {
      title: `${name} refusée`,
      body: `${name} refusée. L’agence recontacte le client pour la suite, notamment une demande de visa.`,
      kind: "urgent",
      priority: "prioritaire",
    };
  }
  if (input.status === "silence") {
    return {
      title: `${name} sans résultat`,
      body: `${name} sans résultat. Aucun résultat depuis deux heures. Le client n’a pas été prévenu.`,
      kind: "question",
      priority: "normale",
    };
  }
  return {
    title: `${name} introuvable`,
    body: `${name} introuvable. Aucune demande n’est trouvée pour ce voyageur.`,
    kind: "question",
    priority: "normale",
  };
}

export function authorizationNoticeTitle(status: string, kind: AuthorizationKind) {
  const name = NAME[kind];
  if (status === "introuvable") return `${name} introuvable`;
  if (status === "refuse") return `${name} refusée`;
  if (status === "approuve") return `${name} valable`;
  return `${name} à traiter`;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const FRESH_MS = 24 * 60 * 60 * 1000;
const SILENCE_MAX_MS = 48 * 60 * 60 * 1000;

export type AuthorizationFollowUp = {
  client: string | null;
  alert: AuthorizationAlert | null;
};

/**
 * Un seul message client par contrôle (client_message_sent_at).
 * Approuvé, introuvable et refusé : message client si ESTA_AUTO_WHATSAPP est ouvert.
 * Introuvable et refusé : alerte agence même si l’envoi client est coupé.
 * Rien depuis deux heures : alerte seulement.
 */
export function decideAuthorizationFollowUp(input: {
  kind: AuthorizationKind;
  status: string;
  validUntil?: string | null;
  checkedAt?: string | null;
  dispatchedAt?: string | null;
  clientSentAt?: string | null;
  now: number;
  autoSend: boolean;
  alreadyAlerted: boolean;
}): AuthorizationFollowUp {
  if (input.status === "a_verifier") {
    const dispatched = Date.parse(input.dispatchedAt || "");
    if (!Number.isFinite(dispatched)) return { client: null, alert: null };
    const age = input.now - dispatched;
    if (age < TWO_HOURS_MS || age > SILENCE_MAX_MS) return { client: null, alert: null };
    const checked = Date.parse(input.checkedAt || "");
    if (Number.isFinite(checked) && checked >= dispatched) return { client: null, alert: null };
    if (input.alreadyAlerted) return { client: null, alert: null };
    return { client: null, alert: authorizationAgencyAlert({ kind: input.kind, status: "silence" }) };
  }
  if (input.status !== "approuve" && input.status !== "introuvable" && input.status !== "refuse") {
    return { client: null, alert: null };
  }
  const checked = Date.parse(input.checkedAt || "");
  if (!Number.isFinite(checked) || input.now - checked > FRESH_MS || input.now < checked) {
    return { client: null, alert: null };
  }
  if (input.clientSentAt) return { client: null, alert: null };
  const client = input.autoSend
    ? authorizationClientText({
        kind: input.kind,
        status: input.status,
        validUntil: input.validUntil,
      })
    : null;
  if (input.status === "approuve") return { client, alert: null };
  return {
    client,
    alert: input.alreadyAlerted
      ? null
      : authorizationAgencyAlert({ kind: input.kind, status: input.status }),
  };
}
