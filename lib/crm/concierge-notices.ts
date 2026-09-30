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
