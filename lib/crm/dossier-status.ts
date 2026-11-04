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
 * Visible = montré au client. Un confirmé encore caché reste Non visible :
 * la migration le laisse caché, elle ne le publie pas.
 * Un brouillon déjà montré est Visible : la migration aligne le statut.
 */
export function dossierFace(booking: StayFaceSource): DossierFace {
  const status = (booking.status || "").trim().toLowerCase();
  if (status === "cancelled" || status === "canceled") return "annule";
  if (booking.visible_to_client) return "visible";
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

/**
 * La carte hôtel part pour un séjour Visible.
 * Un confirmé encore caché garde son statut brut : le passage en Non visible
 * ne le marque pas annulé, donc une carte déjà émise n’est ni gelée ni fermée.
 */
export function hotelCardBookingStatus(booking: StayFaceSource) {
  if (dossierFace(booking) === "visible") return "confirmed";
  const status = (booking.status || "").trim().toLowerCase();
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "confirmed") return "confirmed";
  return status || "draft";
}
