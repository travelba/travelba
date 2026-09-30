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
  piece_hotel: "TWILIO_CONTENT_PIECE_HOTEL",
  piece_vol: "TWILIO_CONTENT_PIECE_VOL",
  piece_transfert: "TWILIO_CONTENT_PIECE_TRANSFERT",
  pieces_regroupees: "TWILIO_CONTENT_PIECES_REGROUPEES",
  passeport_carte: "TWILIO_CONTENT_PASSEPORT_CARTE",
  passeports_carte: "TWILIO_CONTENT_PASSEPORTS_CARTE",
  formalite_manquante_carte: "TWILIO_CONTENT_FORMALITE_MANQUANTE_CARTE",
  formalite_prete_carte: "TWILIO_CONTENT_FORMALITE_PRETE_CARTE",
  connexion_carte: "TWILIO_CONTENT_CONNEXION_CARTE",
  encours: "TWILIO_CONTENT_ENCOURS",
  chauffeur: "TWILIO_CONTENT_CHAUFFEUR",
  rappel: "TWILIO_CONTENT_RAPPEL_DEPART",
  document: "TWILIO_CONTENT_DOCUMENT",
  piece_hotel_photo: "TWILIO_CONTENT_PIECE_HOTEL_PHOTO",
  piece_vol_photo: "TWILIO_CONTENT_PIECE_VOL_PHOTO",
  piece_transfert_photo: "TWILIO_CONTENT_PIECE_TRANSFERT_PHOTO",
  pieces_regroupees_photo: "TWILIO_CONTENT_PIECES_REGROUPEES_PHOTO",
  document_photo: "TWILIO_CONTENT_DOCUMENT_PHOTO",
  passeport_carte_photo: "TWILIO_CONTENT_PASSEPORT_CARTE_PHOTO",
  passeports_carte_photo: "TWILIO_CONTENT_PASSEPORTS_CARTE_PHOTO",
  formalite_manquante_carte_photo: "TWILIO_CONTENT_FORMALITE_MANQUANTE_CARTE_PHOTO",
  formalite_prete_carte_photo: "TWILIO_CONTENT_FORMALITE_PRETE_CARTE_PHOTO",
  connexion_carte_photo: "TWILIO_CONTENT_CONNEXION_CARTE_PHOTO",
  encours_photo: "TWILIO_CONTENT_ENCOURS_PHOTO",
  chauffeur_photo: "TWILIO_CONTENT_CHAUFFEUR_PHOTO",
  rappel_photo: "TWILIO_CONTENT_RAPPEL_DEPART_PHOTO",
  piece_photo: "TWILIO_CONTENT_PIECE_PHOTO",
  pieces_photo: "TWILIO_CONTENT_PIECES_PHOTO",
  pieces_composees_photo: "TWILIO_CONTENT_PIECES_COMPOSEES_PHOTO",
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

/** Photo du séjour : JPEG public du lieu d’arrivée. Jamais le monogramme, jamais une signed URL. */
export function isStayCoverMedia(url: string) {
  if (/og-concierge|supabase\.co|token=/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return /^\/api\/covers\/sejour\/[A-Za-z0-9-]{4,40}$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export const WHATSAPP_IMAGE_KINDS = [
  "hotel",
  "billet",
  "transfert",
  "pieces",
  "document",
  "passeport",
  "visa",
  "encours",
  "chauffeur",
  "rappel",
  "connexion",
  "partage",
] as const;

export type WhatsappImageKind = (typeof WHATSAPP_IMAGE_KINDS)[number];

const WHATSAPP_IMAGE_FILE = new RegExp(`^/whatsapp/(${WHATSAPP_IMAGE_KINDS.join("|")})\\.jpg$`);

/** Illustration du sujet du message. Pas la couverture du séjour. */
export function whatsappTypeImageUrl(kind: WhatsappImageKind) {
  return `${siteConfig.url}/whatsapp/${kind}.jpg`;
}

export const WHATSAPP_IMAGE_ALT: Record<WhatsappImageKind, string> = {
  hotel: "Hôtel TBA",
  billet: "TBA Airlines",
  transfert: "TBA Transfer",
  pieces: "Pièces TBA",
  document: "Document TBA",
  passeport: "Passeport TBA",
  visa: "TBA Visa",
  encours: "Compte TBA",
  chauffeur: "TBA Chauffeur",
  rappel: "Départ TBA",
  connexion: "Espace TBA",
  partage: "TBA Airlines",
};

export function whatsappTypeImageKind(url: string): WhatsappImageKind | null {
  try {
    const parsed = new URL(url);
    const kind = parsed.pathname.match(WHATSAPP_IMAGE_FILE)?.[1];
    return kind ? (kind as WhatsappImageKind) : null;
  } catch {
    return null;
  }
}

/** JPEG d’une typologie, hébergé sur travelba.fr. */
export function isWhatsappTypeMedia(url: string) {
  if (/og-concierge|supabase\.co|token=/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.replace(/^www\./, "");
    if (host !== "travelba.fr") return false;
    return WHATSAPP_IMAGE_FILE.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isConciergeMedia(url: string) {
  return isStayCoverMedia(url) || isWhatsappTypeMedia(url);
}

/** 404 ou logo : pas d’image. Le message part en texte, avec le bouton. */
export async function liveConciergeImage(url: string | null, fetchImpl: typeof fetch = fetch) {
  if (!url || !isConciergeMedia(url)) return null;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/")) return null;
    return url;
  } catch {
    return null;
  }
}

export async function liveStayCover(url: string | null, fetchImpl: typeof fetch = fetch) {
  if (!url || !isStayCoverMedia(url)) return null;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/")) return null;
    return url;
  } catch {
    return null;
  }
}

/** {{1}} du modèle « Votre séjour à {{1}} est dans votre espace. » */
export function stayTemplateSlot(place: string, reference: string) {
  return `${place}, réservation ${reference},`;
}

export function stayNoticeLine(place: string, reference: string) {
  return `Votre séjour à ${stayTemplateSlot(place, reference)} est dans votre espace.`;
}

export type StayPlan = {
  body: string;
  place: string;
  mediaUrl: string | null;
  template: "sejour" | "sejour_texte";
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
  if (!place) return null;
  const mediaUrl = stayCoverUrl(input.reference, input.hasCover);
  return {
    body: withConciergeSignature(stayNoticeLine(place, input.reference)),
    place,
    mediaUrl,
    template: mediaUrl ? "sejour" : "sejour_texte",
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
  /** Pièce seule. La référence et le lieu sont ajoutés à l’envoi, dans {{1}}. */
  variable: string;
  place: string | null;
  ids: string[];
  path: string;
};

function bookingTail(reference: string, place: string | null) {
  return place ? `${reference}, séjour à ${place}` : reference;
}

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

export function piecesSentence(
  kinds: string[],
  reference: string,
  place: string | null
): Pick<PiecesPlan, "body" | "template" | "variable"> | null {
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
  if (!groups.length || !REFERENCE.test(reference)) return null;
  const [first, ...rest] = groups;
  const firstBare = first.count > 1 ? first.noun.plural : first.noun.singular;
  const restText = rest.map((group) => articulated(group.noun, group.count > 1));
  const tail = bookingTail(reference, place);
  if (!rest.length) {
    if (first.count > 1) {
      return {
        template: "pieces",
        variable: firstBare,
        body: withConciergeSignature(`Vos ${firstBare} sont dans la réservation ${tail}.`),
      };
    }
    return {
      template: "piece",
      variable: firstBare,
      body: withConciergeSignature(`Votre ${firstBare} est dans la réservation ${tail}.`),
    };
  }
  const variable = joinFr([firstBare, ...restText]);
  if (first.count > 1) {
    return {
      template: "pieces",
      variable,
      body: withConciergeSignature(`Vos ${variable} sont dans la réservation ${tail}.`),
    };
  }
  return {
    template: "pieces_composees",
    variable,
    body: withConciergeSignature(`Votre ${variable} sont dans la réservation ${tail}.`),
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
  destination?: string | null;
  title?: string | null;
  pieces: PieceStamp[];
}): PiecesPlan[] {
  if (!input.published) return [];
  const path = reservationPath(input.reference);
  if (!path) return [];
  const place = stayPlaceName(input.destination ?? null, input.title ?? null);
  const plans: PiecesPlan[] = [];
  for (const group of clusterPieces(input.pieces)) {
    const sentence = piecesSentence(group.map((piece) => piece.kind), input.reference, place);
    if (!sentence) continue;
    plans.push({ ...sentence, place, ids: group.map((piece) => piece.id), path });
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
    url: `https://travelba.fr/e/{{${variable}}}` ,
  };
}
