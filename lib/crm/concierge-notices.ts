import { coverQuery } from "./carnet";
import { unsplashKeywordMatch } from "./covers";
import { siteConfig } from "../site";
import { CONCIERGE_SIGNATURE, withConciergeSignature } from "./whatsapp";

/** Fenêtre de regroupement des pièces ajoutées. */
export const PIECES_WINDOW_MS = 60 * 60 * 1000;

export const PIECES_PATH = "/mon-compte/profil/documents";

const REFERENCE = /^[A-Za-z0-9-]{4,40}$/;

export function isBookingReference(value: string) {
  return REFERENCE.test(value);
}
const HUB = /^(paris|cdg|ory|lbg|bva|france)$/i;

export const CONCIERGE_TEMPLATE_ENV = {
  sejour: "TWILIO_CONTENT_SEJOUR",
  sejour_texte: "TWILIO_CONTENT_SEJOUR_TEXTE",
  sejour_sans_lieu: "TWILIO_CONTENT_SEJOUR_SANS_LIEU",
  sejour_sans_lieu_texte: "TWILIO_CONTENT_SEJOUR_SANS_LIEU_TEXTE",
  pieces: "TWILIO_CONTENT_PIECES",
  piece: "TWILIO_CONTENT_PIECE",
  pieces_composees: "TWILIO_CONTENT_PIECES_COMPOSEES",
  passeport: "TWILIO_CONTENT_PASSEPORT",
  passeports: "TWILIO_CONTENT_PASSEPORTS",
  formalite_manquante: "TWILIO_CONTENT_FORMALITE_MANQUANTE",
  formalite_prete: "TWILIO_CONTENT_FORMALITE_PRETE",
} as const;

export type ConciergeTemplate = keyof typeof CONCIERGE_TEMPLATE_ENV;

/** SID lu dans l’environnement. Vide tant que Meta n’a pas approuvé : aucun SID inventé. */
export function conciergeContentSid(template: ConciergeTemplate) {
  return process.env[CONCIERGE_TEMPLATE_ENV[template]]?.trim() || "";
}

export function reservationPath(reference: string) {
  if (!REFERENCE.test(reference)) return null;
  return `/mon-compte/reservations/${reference}`;
}

/** Ville ou station d’arrivée. Pas de repli inventé (ni « voyage », ni un hub de départ). */
export function stayPlaceName(destination: string | null, title: string | null) {
  const place = coverQuery(destination, title).replace(/[\r\n]+/g, " ").trim();
  if (!place || place.toLowerCase() === "voyage" || HUB.test(place)) return null;
  return place;
}

export function stayHasPublishedCover(booking: {
  destination: string | null;
  title: string | null;
  cover_image_path: string | null;
}) {
  if (booking.cover_image_path) return true;
  return Boolean(
    unsplashKeywordMatch({ destination: booking.destination, title: booking.title || "" })
  );
}

/** JPEG public, sans jeton. Twilio le récupère en HTTPS. */
export function stayCoverUrl(reference: string, hasCover: boolean) {
  if (!hasCover || !REFERENCE.test(reference)) return null;
  return `${siteConfig.url}/api/covers/sejour/${reference}`;
}

export type StayPlan = {
  body: string;
  place: string | null;
  mediaUrl: string | null;
  template: "sejour" | "sejour_texte" | "sejour_sans_lieu" | "sejour_sans_lieu_texte";
  path: string;
};

export function planStayNotice(input: {
  published: boolean;
  reference: string;
  destination: string | null;
  title: string | null;
  hasCover: boolean;
}): StayPlan | null {
  if (!input.published) return null;
  const path = reservationPath(input.reference);
  if (!path) return null;
  const place = stayPlaceName(input.destination, input.title);
  const mediaUrl = stayCoverUrl(input.reference, input.hasCover);
  const line = place
    ? `Votre séjour à ${place} est dans votre espace.`
    : "Votre séjour est dans votre espace.";
  let template: StayPlan["template"];
  if (place && mediaUrl) template = "sejour";
  else if (place) template = "sejour_texte";
  else if (mediaUrl) template = "sejour_sans_lieu";
  else template = "sejour_sans_lieu_texte";
  return {
    body: withConciergeSignature(line),
    place,
    mediaUrl,
    template,
    path,
  };
}

type Noun = {
  singular: string;
  plural: string;
  singularArticle: "le" | "la" | "l'";
};

const NOUNS: Record<string, Noun> = {
  flight: { singular: "billet", plural: "billets", singularArticle: "le" },
  rail: { singular: "billet de train", plural: "billets de train", singularArticle: "le" },
  hotel: { singular: "confirmation d'hôtel", plural: "confirmations d'hôtel", singularArticle: "la" },
  transfer: { singular: "transfert", plural: "transferts", singularArticle: "le" },
  car: { singular: "confirmation de voiture", plural: "confirmations de voiture", singularArticle: "la" },
  cruise: { singular: "confirmation de bateau", plural: "confirmations de bateau", singularArticle: "la" },
  activity: { singular: "confirmation d'activité", plural: "confirmations d'activité", singularArticle: "la" },
  insurance: { singular: "assurance", plural: "assurances", singularArticle: "l'" },
  visa: { singular: "visa", plural: "visas", singularArticle: "le" },
  other: { singular: "pièce", plural: "pièces", singularArticle: "la" },
};

const KIND_ORDER = Object.keys(NOUNS);

export function normalizePieceKind(kind: string | null | undefined) {
  const value = (kind || "").trim().toLowerCase();
  if (!value || value === "fee" || value === "expense") return null;
  if (value === "pdf" || value === "image" || value === "other") return "other";
  return value in NOUNS ? value : "other";
}

export type PieceStamp = { id: string; kind: string; at: string };

export type PiecesPlan = {
  body: string;
  template: "pieces" | "piece" | "pieces_composees";
  variable: string;
  ids: string[];
  path: string;
};

function articulated(noun: Noun, plural: boolean) {
  if (plural) return `les ${noun.plural}`;
  if (noun.singularArticle === "l'") return `l'${noun.singular}`;
  return `${noun.singularArticle} ${noun.singular}`;
}

function joinFr(parts: string[]) {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} et ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

export function piecesSentence(kinds: string[]): Pick<PiecesPlan, "body" | "template" | "variable"> | null {
  const counts = new Map<string, number>();
  for (const kind of kinds) {
    const normalized = normalizePieceKind(kind);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  const groups = KIND_ORDER.filter((kind) => counts.has(kind)).map((kind) => ({
    kind,
    count: counts.get(kind) || 0,
    noun: NOUNS[kind],
  }));
  if (!groups.length) return null;
  const [first, ...rest] = groups;
  const firstBare = first.count > 1 ? first.noun.plural : first.noun.singular;
  const restText = rest.map((group) => articulated(group.noun, group.count > 1));
  if (!rest.length) {
    if (first.count > 1) {
      return {
        template: "pieces",
        variable: firstBare,
        body: withConciergeSignature(`Vos ${firstBare} sont dans la réservation.`),
      };
    }
    return {
      template: "piece",
      variable: firstBare,
      body: withConciergeSignature(`Votre ${firstBare} est dans la réservation.`),
    };
  }
  const variable = joinFr([firstBare, ...restText]);
  if (first.count > 1) {
    return {
      template: "pieces",
      variable,
      body: withConciergeSignature(`Vos ${variable} sont dans la réservation.`),
    };
  }
  return {
    template: "pieces_composees",
    variable,
    body: withConciergeSignature(`Votre ${variable} sont dans la réservation.`),
  };
}

function clusterPieces(pieces: PieceStamp[]) {
  const sorted = [...pieces].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const groups: PieceStamp[][] = [];
  for (const piece of sorted) {
    const current = groups[groups.length - 1];
    const start = current ? Date.parse(current[0].at) : NaN;
    const at = Date.parse(piece.at);
    if (!current || !Number.isFinite(start) || !Number.isFinite(at) || at - start > PIECES_WINDOW_MS) {
      groups.push([piece]);
    } else {
      current.push(piece);
    }
  }
  return groups;
}

/** Un message par fenêtre d’une heure. Rien si le séjour n’est pas publié. */
export function planPiecesNotices(input: {
  published: boolean;
  reference: string;
  pieces: PieceStamp[];
}): PiecesPlan[] {
  if (!input.published) return [];
  const path = reservationPath(input.reference);
  if (!path) return [];
  const plans: PiecesPlan[] = [];
  for (const group of clusterPieces(input.pieces)) {
    const sentence = piecesSentence(group.map((piece) => piece.kind));
    if (!sentence) continue;
    plans.push({ ...sentence, ids: group.map((piece) => piece.id), path });
  }
  return plans;
}

export function safeFormalityName(value: string | null | undefined) {
  const name = (value || "").replace(/[\r\n]+/g, " ").trim();
  if (!name || name.length > 40) return null;
  if (/[%]|https?:|mot de passe/i.test(name)) return null;
  return name;
}

export type MissingPiecePlan = {
  body: string;
  template: "passeport" | "passeports" | "formalite_manquante";
  variable: string | null;
  path: string;
  dedupe: string;
};

export function planMissingPieceNotices(input: {
  published: boolean;
  reference: string;
  bookingId: string;
  startDate: string | null;
  today: string;
  missingPassports: number;
  formalities: { name: string | null; filed: boolean }[];
  alreadySent: { passport: boolean; formalityNames: string[] };
}): MissingPiecePlan[] {
  if (!input.published) return [];
  if (!input.startDate || input.startDate < input.today) return [];
  const reservation = reservationPath(input.reference);
  if (!reservation) return [];
  const plans: MissingPiecePlan[] = [];
  if (input.missingPassports > 0 && !input.alreadySent.passport) {
    const many = input.missingPassports > 1;
    plans.push({
      template: many ? "passeports" : "passeport",
      variable: null,
      path: PIECES_PATH,
      dedupe: `passeport:${input.bookingId}`,
      body: withConciergeSignature(
        many
          ? "Des passeports manquent avant le départ. Déposez-les dans vos pièces."
          : "Le passeport manque avant le départ. Déposez-le dans vos pièces."
      ),
    });
  }
  const sent = new Set(input.alreadySent.formalityNames);
  for (const formality of input.formalities) {
    if (formality.filed) continue;
    const name = safeFormalityName(formality.name);
    if (!name || sent.has(name)) continue;
    plans.push({
      template: "formalite_manquante",
      variable: name,
      path: reservation,
      dedupe: `formalite-manquante:${input.bookingId}:${name}`,
      body: withConciergeSignature(`Votre ${name} manque avant le départ.`),
    });
    sent.add(name);
  }
  return plans;
}

export function planFormalityReady(input: {
  published: boolean;
  formality: string | null;
}): { body: string; template: "formalite_prete"; variable: string; path: string } | null {
  if (!input.published) return null;
  const name = safeFormalityName(input.formality);
  if (!name) return null;
  return {
    template: "formalite_prete",
    variable: name,
    path: PIECES_PATH,
    body: withConciergeSignature(`Votre ${name} est dans vos pièces.`),
  };
}

function button(title: string, variable: string) {
  return {
    type: "URL" as const,
    title,
    url: `https://travelba.fr/e/{{${variable}}}`,
  };
}

function textTemplate(body: string, title: string, variable: string) {
  return {
    "twilio/call-to-action": {
      body,
      actions: [button(title, variable)],
    },
  };
}

function mediaTemplate(body: string, title: string, mediaVariable: string, buttonVariable: string) {
  return {
    "whatsapp/card": {
      body,
      media: [`{{${mediaVariable}}}`],
      actions: [button(title, buttonVariable)],
    },
  };
}

const STAY_LINE = "Votre séjour à {{1}} est dans votre espace.";
const STAY_LINE_BARE = "Votre séjour est dans votre espace.";

function contentDraft(input: {
  friendlyName: string;
  variables: Record<string, string>;
  types: Record<string, unknown>;
}) {
  return {
    friendly_name: input.friendlyName,
    language: "fr",
    variables: input.variables,
    types: input.types,
  };
}

/** Brouillons Twilio à soumettre. Le SID n’est pas dans ce fichier. */
export function conciergeContentDrafts() {
  const signature = `\n\n${CONCIERGE_SIGNATURE}`;
  const stayBody = `${STAY_LINE}${signature}`;
  const stayBare = `${STAY_LINE_BARE}${signature}`;
  // Échantillon pour la revue Meta. L’envoi réel utilise la couverture du séjour.
  const sampleImage = `${siteConfig.url}/og-concierge.jpg`;
  const code = "c/23456789";
  return [
    {
      template: "sejour" as const,
      env: CONCIERGE_TEMPLATE_ENV.sejour,
      friendlyName: "sejour_publie",
      create: contentDraft({
        friendlyName: "sejour_publie",
        variables: { "1": "Avoriaz", "2": sampleImage, "3": code },
        types: mediaTemplate(stayBody, "Voir le séjour", "2", "3"),
      }),
    },
    {
      template: "sejour_texte" as const,
      env: CONCIERGE_TEMPLATE_ENV.sejour_texte,
      friendlyName: "sejour_publie_texte",
      create: contentDraft({
        friendlyName: "sejour_publie_texte",
        variables: { "1": "Avoriaz", "2": code },
        types: textTemplate(stayBody, "Voir le séjour", "2"),
      }),
    },
    {
      template: "sejour_sans_lieu" as const,
      env: CONCIERGE_TEMPLATE_ENV.sejour_sans_lieu,
      friendlyName: "sejour_sans_lieu",
      create: contentDraft({
        friendlyName: "sejour_sans_lieu",
        variables: { "1": sampleImage, "2": code },
        types: mediaTemplate(stayBare, "Voir le séjour", "1", "2"),
      }),
    },
    {
      template: "sejour_sans_lieu_texte" as const,
      env: CONCIERGE_TEMPLATE_ENV.sejour_sans_lieu_texte,
      friendlyName: "sejour_sans_lieu_texte",
      create: contentDraft({
        friendlyName: "sejour_sans_lieu_texte",
        variables: { "1": code },
        types: textTemplate(stayBare, "Voir le séjour", "1"),
      }),
    },
    {
      template: "pieces" as const,
      env: CONCIERGE_TEMPLATE_ENV.pieces,
      friendlyName: "pieces_reservation",
      create: contentDraft({
        friendlyName: "pieces_reservation",
        variables: { "1": "billets et la confirmation d'hôtel", "2": code },
        types: textTemplate(
          `Vos {{1}} sont dans la réservation.${signature}`,
          "Ouvrir la réservation",
          "2"
        ),
      }),
    },
    {
      template: "piece" as const,
      env: CONCIERGE_TEMPLATE_ENV.piece,
      friendlyName: "piece_reservation",
      create: contentDraft({
        friendlyName: "piece_reservation",
        variables: { "1": "confirmation d'hôtel", "2": code },
        types: textTemplate(
          `Votre {{1}} est dans la réservation.${signature}`,
          "Ouvrir la réservation",
          "2"
        ),
      }),
    },
    {
      template: "pieces_composees" as const,
      env: CONCIERGE_TEMPLATE_ENV.pieces_composees,
      friendlyName: "pieces_composees",
      create: contentDraft({
        friendlyName: "pieces_composees",
        variables: { "1": "confirmation d'hôtel et le transfert", "2": code },
        types: textTemplate(
          `Votre {{1}} sont dans la réservation.${signature}`,
          "Ouvrir la réservation",
          "2"
        ),
      }),
    },
    {
      template: "passeport" as const,
      env: CONCIERGE_TEMPLATE_ENV.passeport,
      friendlyName: "passeport_manquant",
      create: contentDraft({
        friendlyName: "passeport_manquant",
        variables: { "1": code },
        types: textTemplate(
          `Le passeport manque avant le départ. Déposez-le dans vos pièces.${signature}`,
          "Déposer le passeport",
          "1"
        ),
      }),
    },
    {
      template: "passeports" as const,
      env: CONCIERGE_TEMPLATE_ENV.passeports,
      friendlyName: "passeports_manquants",
      create: contentDraft({
        friendlyName: "passeports_manquants",
        variables: { "1": code },
        types: textTemplate(
          `Des passeports manquent avant le départ. Déposez-les dans vos pièces.${signature}`,
          "Déposer les passeports",
          "1"
        ),
      }),
    },
    {
      template: "formalite_manquante" as const,
      env: CONCIERGE_TEMPLATE_ENV.formalite_manquante,
      friendlyName: "formalite_manquante",
      create: contentDraft({
        friendlyName: "formalite_manquante",
        variables: { "1": "ESTA", "2": code },
        types: textTemplate(
          `Votre {{1}} manque avant le départ.${signature}`,
          "Voir la formalité",
          "2"
        ),
      }),
    },
    {
      template: "formalite_prete" as const,
      env: CONCIERGE_TEMPLATE_ENV.formalite_prete,
      friendlyName: "formalite_prete",
      create: contentDraft({
        friendlyName: "formalite_prete",
        variables: { "1": "ESTA", "2": code },
        types: textTemplate(`Votre {{1}} est dans vos pièces.${signature}`, "Voir les pièces", "2"),
      }),
    },
  ];
}

function cleanToken(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** Variables du bouton : suffixe `c/CODE`, jamais le jeton ni un mot de passe. */
export function conciergeContentVariables(input: {
  template: ConciergeTemplate;
  buttonSuffix: string;
  place?: string | null;
  mediaUrl?: string | null;
  variable?: string | null;
}): Record<string, string> | null {
  const suffix = cleanToken(input.buttonSuffix);
  if (!suffix.startsWith("c/") || suffix.includes("://") || /token|password|mot de passe/i.test(suffix)) {
    return null;
  }
  const text = cleanToken(input.variable || "");
  const place = cleanToken(input.place || "");
  const media = cleanToken(input.mediaUrl || "");
  if (input.template === "sejour") {
    if (!place || !media.startsWith("https://") || /supabase\.co|token=/i.test(media)) return null;
    return { "1": place, "2": media, "3": suffix };
  }
  if (input.template === "sejour_texte") {
    if (!place) return null;
    return { "1": place, "2": suffix };
  }
  if (input.template === "sejour_sans_lieu") {
    if (!media.startsWith("https://") || /supabase\.co|token=/i.test(media)) return null;
    return { "1": media, "2": suffix };
  }
  if (input.template === "sejour_sans_lieu_texte" || input.template === "passeport" || input.template === "passeports") {
    return { "1": suffix };
  }
  if (!text) return null;
  return { "1": text, "2": suffix };
}
