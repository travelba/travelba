import type { BookingStatus } from "@/lib/crm/types";

/** Les trois états que l’agence et le connecteur voient. L’archive reste à part. */
export const DOSSIER_FACES = ["non_visible", "visible", "annule"] as const;
export type DossierFace = (typeof DOSSIER_FACES)[number];

export const DOSSIER_FACE_LABELS: Record<DossierFace, string> = {
  non_visible: "Non visible",
  visible: "Visible",
  annule: "Annulé",
};

type StayFaceSource = {
  status?: string | null;
  visible_to_client?: boolean | null;
};

/**
 * Visible = montré au client = confirmé.
 * Un confirmé encore caché, ou un brouillon déjà publié, compte déjà comme Visible :
 * la migration aligne les deux colonnes, l’écran ne les sépare plus.
 */
export function dossierFace(booking: StayFaceSource): DossierFace {
  const status = (booking.status || "").trim().toLowerCase();
  if (status === "cancelled" || status === "canceled") return "annule";
  if (booking.visible_to_client || status === "confirmed") return "visible";
  return "non_visible";
}

export function dossierFaceLabel(booking: StayFaceSource) {
  return DOSSIER_FACE_LABELS[dossierFace(booking)];
}

/** Colonnes écrites ensemble. Un séjour archivé ne passe pas par ici : l’archive garde la visibilité. */
export function columnsForFace(face: DossierFace): {
  status: BookingStatus;
  visible_to_client: boolean;
} {
  if (face === "annule") return { status: "cancelled", visible_to_client: false };
  if (face === "visible") return { status: "confirmed", visible_to_client: true };
  return { status: "draft", visible_to_client: false };
}

const FACE_WORDS: Record<string, DossierFace> = {
  nonvisible: "non_visible",
  draft: "non_visible",
  brouillon: "non_visible",
  quoted: "non_visible",
  devis: "non_visible",
  preparation: "non_visible",
  enpreparation: "non_visible",
  visible: "visible",
  confirmed: "visible",
  confirme: "visible",
  confirmee: "visible",
  montre: "visible",
  annule: "annule",
  annulee: "annule",
  cancelled: "annule",
  canceled: "annule",
};

/** non_visible, visible, annule — et les anciens mots (brouillon, devis, confirme). */
export function dossierFaceFromWord(value: unknown): DossierFace | null {
  if (typeof value !== "string") return null;
  const key = value
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return FACE_WORDS[key] || null;
}

/** La carte hôtel part pour un séjour Visible. Archivé ou non, le confirmé d’aujourd’hui le reste. */
export function hotelCardBookingStatus(booking: StayFaceSource) {
  if (dossierFace(booking) === "visible") return "confirmed";
  const status = (booking.status || "").trim().toLowerCase();
  return status || "draft";
}
