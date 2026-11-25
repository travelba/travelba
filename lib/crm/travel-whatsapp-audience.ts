import { toE164 } from "./phone";
import { foldLetters } from "./text";

/**
 * Infos voyage WhatsApp pour un conjoint, dossier par dossier.
 * L’argent, le compte et l’espace client n’entrent pas dans cet éventail.
 */

const SPOUSE_KEYS = new Set([
  "conjoint",
  "conjointe",
  "epouse",
  "epoux",
  "mari",
  "femme",
  "spouse",
  "wife",
  "husband",
]);

/** Libellés hors liste : épouse, époux, mari, femme, et le libellé Conjoint(e). */
export function isSpouseRelationship(value: string | null | undefined) {
  const key = foldLetters(value);
  return SPOUSE_KEYS.has(key);
}

export const SPOUSE_TRAVEL_INTRO_TEMPLATE = {
  name: "infos_voyage_conjoint",
  env: "TWILIO_CONTENT_INFOS_VOYAGE_CONJOINT",
  /** {{1}} prénom, {{2}} nom du séjour. Pas de lien, pas de compte. */
  body: "Bonjour {{1}}, l’agence vous enverra les informations de voyage de {{2}}. Répondez Stop pour arrêter.",
} as const;

export const TRAVEL_NOTICE_KINDS = [
  "sejour",
  "pieces",
  "passeport",
  "formalite",
  "autorisation",
  "esta",
  "eta",
  "vol",
  "carte_embarquement",
  "restaurant",
  "touchpoint",
] as const;

export type TravelNoticeKind = (typeof TRAVEL_NOTICE_KINDS)[number];

/** Encours, relevé, facture, connexion, invitation, option Hôtels, vœux, dépenses d’équipe. */
export const ACCOUNT_NOTICE_KINDS = [
  "encours",
  "relance_encours",
  "releve",
  "facture",
  "connexion",
  "espace_client",
  "option_hotel",
  "invitation",
  "voeux",
  "club",
  "depense",
  "depense_equipe",
] as const;

export function isTravelNoticeKind(kind: string): kind is TravelNoticeKind {
  return (TRAVEL_NOTICE_KINDS as readonly string[]).includes(kind);
}

export function isAccountNoticeKind(kind: string) {
  return (ACCOUNT_NOTICE_KINDS as readonly string[]).includes(kind);
}

export function dossierTravelLabel(input: { title?: string | null; reference?: string | null }) {
  const title = (input.title || "").replace(/\s+/g, " ").trim();
  if (title) return title;
  const reference = (input.reference || "").replace(/\s+/g, " ").trim();
  return reference || "votre séjour";
}

export function spouseTravelIntroText(input: { firstName?: string | null; dossier: string }) {
  const name = (input.firstName || "").replace(/[\r\n]+/g, " ").trim();
  const hello = name ? `Bonjour ${name}` : "Bonjour";
  const dossier = input.dossier.replace(/[\r\n]+/g, " ").trim() || "votre séjour";
  return `${hello}, l’agence vous enverra les informations de voyage de ${dossier}. Répondez Stop pour arrêter.`;
}

/** Retire l’espace client et les liens de connexion. Le texte voyage reste. */
export function travelTextForSpouse(body: string) {
  return body
    .split("\n")
    .filter((line) => !/\/mon-compte\b|\/e\/[A-Za-z0-9]/i.test(line))
    .map((line) =>
      line
        .replace(/https?:\/\/\S*\/mon-compte\S*/gi, "")
        .replace(/https?:\/\/\S*\/e\/\S*/gi, "")
        .trim()
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

const COMPANION_ACCOUNT =
  /encours|reste a payer|solde|transaction|coffre|passeport|mon-compte|espace personnel|ouvrir mon espace|relev[eé]|facture/i;

/** Réponse entrante d’un conjoint : voyage seulement, sans lien vers l’espace du titulaire. */
export function companionSafeText(body: string) {
  const kept = body
    .split("\n")
    .map((line) => line.replace(/https?:\/\/\S+/g, "").trim())
    .filter((line) => line && !COMPANION_ACCOUNT.test(line) && !/\/mon-compte\b|\/e\/[A-Za-z0-9]/i.test(line));
  const text = kept.join("\n").trim();
  if (text.length < 8) {
    return "Je transmets votre message à l’agence. Cet échange reste sur les informations de voyage.";
  }
  return text;
}

export type TravelAudienceHolder = {
  id: string;
  phone: string | null;
  phoneSecondary?: string | null;
  firstName?: string | null;
  optInAt?: string | null;
  optOutAt?: string | null;
};

export type TravelAudienceTraveler = {
  id: string;
  companionId: string | null;
  isAccountHolder: boolean;
  /** Absent ou vrai : coché. Faux : l’agence a retiré ce dossier. */
  whatsappTravelUpdates?: boolean | null;
};

export type TravelAudienceCompanion = {
  id: string;
  customerId: string;
  relationship: string | null;
  phone: string | null;
  firstName?: string | null;
  optOutAt?: string | null;
  introSentAt?: string | null;
};

export type TravelAudienceRecipient = {
  role: "holder" | "spouse";
  phone: string;
  customerId: string | null;
  companionId: string | null;
  travelerId: string | null;
  firstName: string;
  introSent: boolean;
};

export type TravelAudienceSkip = {
  companionId: string | null;
  travelerId: string | null;
  reason: string;
};

function handset(value: string | null | undefined) {
  const text = (value || "").trim();
  if (!text) return null;
  return toE164(text, "FR");
}

function holderPhones(holder: TravelAudienceHolder) {
  return [handset(holder.phone), handset(holder.phoneSecondary)].filter((value): value is string => Boolean(value));
}

/**
 * Titulaire (s’il a déjà accepté WhatsApp) et conjoints cochés de CE dossier.
 * Même numéro que le titulaire : un seul envoi. Numéro d’une autre fiche : pas de second envoi, pas de fusion.
 * Un non-conjoint, un téléphone invalide ou une case décochée sort de la liste.
 * Le conjoint ne voit que les dossiers où il est voyageur : l’appelant passe les voyageurs de ce dossier-là.
 */
export function selectTravelWhatsappAudience(input: {
  holder: TravelAudienceHolder;
  travelers: TravelAudienceTraveler[];
  companions: TravelAudienceCompanion[];
  otherCustomerPhones?: { customerId: string; phone: string | null }[];
}): { recipients: TravelAudienceRecipient[]; skipped: TravelAudienceSkip[] } {
  const recipients: TravelAudienceRecipient[] = [];
  const skipped: TravelAudienceSkip[] = [];
  const used = new Set<string>();
  const holderSet = new Set(holderPhones(input.holder));
  const otherPhones = new Set<string>();
  for (const row of input.otherCustomerPhones || []) {
    if (row.customerId === input.holder.id) continue;
    const phone = handset(row.phone);
    if (phone) otherPhones.add(phone);
  }

  const holderPhone = handset(input.holder.phone);
  const holderAllowed = Boolean(input.holder.optInAt) && !input.holder.optOutAt && Boolean(holderPhone);
  if (holderAllowed && holderPhone) {
    recipients.push({
      role: "holder",
      phone: holderPhone,
      customerId: input.holder.id,
      companionId: null,
      travelerId: null,
      firstName: (input.holder.firstName || "").trim(),
      introSent: true,
    });
    used.add(holderPhone);
  }

  const companions = new Map(input.companions.map((row) => [row.id, row]));
  for (const traveler of input.travelers) {
    if (traveler.isAccountHolder || !traveler.companionId) continue;
    const companion = companions.get(traveler.companionId);
    if (!companion || companion.customerId !== input.holder.id) {
      skipped.push({ companionId: traveler.companionId, travelerId: traveler.id, reason: "compagnon" });
      continue;
    }
    if (!isSpouseRelationship(companion.relationship)) {
      skipped.push({ companionId: companion.id, travelerId: traveler.id, reason: "lien" });
      continue;
    }
    if (traveler.whatsappTravelUpdates === false) {
      skipped.push({ companionId: companion.id, travelerId: traveler.id, reason: "decoche" });
      continue;
    }
    const phone = handset(companion.phone);
    if (!phone) {
      skipped.push({ companionId: companion.id, travelerId: traveler.id, reason: "telephone" });
      continue;
    }
    if (companion.optOutAt) {
      skipped.push({ companionId: companion.id, travelerId: traveler.id, reason: "stop" });
      continue;
    }
    if (holderSet.has(phone) || used.has(phone)) {
      skipped.push({ companionId: companion.id, travelerId: traveler.id, reason: "doublon" });
      continue;
    }
    if (otherPhones.has(phone)) {
      skipped.push({ companionId: companion.id, travelerId: traveler.id, reason: "autre_fiche" });
      continue;
    }
    used.add(phone);
    recipients.push({
      role: "spouse",
      phone,
      customerId: null,
      companionId: companion.id,
      travelerId: traveler.id,
      firstName: (companion.firstName || "").trim(),
      introSent: Boolean(companion.introSentAt),
    });
  }

  return { recipients, skipped };
}

export type SpouseDelivery = {
  phone: string;
  companionId: string;
  travelerId: string | null;
  firstName: string;
  intro: string | null;
  body: string;
};

/** Messages à préparer. Rien n’est envoyé ici. Les kinds d’argent renvoient une liste vide. */
export function planSpouseTravelDeliveries(input: {
  kind: string;
  visible: boolean;
  body: string;
  dossier: string;
  audience: { recipients: TravelAudienceRecipient[] };
  exceptPhones?: string[];
}): SpouseDelivery[] {
  if (!input.visible || !isTravelNoticeKind(input.kind) || isAccountNoticeKind(input.kind)) return [];
  const text = travelTextForSpouse(input.body);
  if (!text) return [];
  const except = new Set((input.exceptPhones || []).map((value) => handset(value)).filter((value): value is string => Boolean(value)));
  const deliveries: SpouseDelivery[] = [];
  for (const row of input.audience.recipients) {
    if (row.role !== "spouse" || !row.companionId) continue;
    if (except.has(row.phone)) continue;
    deliveries.push({
      phone: row.phone,
      companionId: row.companionId,
      travelerId: row.travelerId,
      firstName: row.firstName,
      intro: row.introSent ? null : spouseTravelIntroText({ firstName: row.firstName, dossier: input.dossier }),
      body: text,
    });
  }
  return deliveries;
}
