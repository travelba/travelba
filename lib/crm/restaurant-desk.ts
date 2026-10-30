import { RESTAURANT_ALLOWLIST_BLOCK } from "./restaurant-allowlist";
import { zonedInstant, type TableSeat, type TableStatus } from "./restaurants";

export type DeskTone = "gris" | "encre" | "vert" | "orange" | "mute";

export type DeskFaceStatus = "a_choisir" | "proposee" | "envoyee" | "acceptee" | "refusee" | "a_annuler" | "annulee";

export type DeskPhase = "choisir" | "envoyer" | "attendre" | "annuler";

const FACE_LABEL: Record<DeskFaceStatus, string> = {
  a_choisir: "À choisir",
  proposee: "Proposée",
  envoyee: "Envoyée",
  acceptee: "Acceptée",
  refusee: "Refusée",
  a_annuler: "À annuler",
  annulee: "Annulée",
};

const FACE_TONE: Record<DeskFaceStatus, DeskTone> = {
  a_choisir: "gris",
  proposee: "gris",
  envoyee: "encre",
  acceptee: "vert",
  refusee: "orange",
  a_annuler: "orange",
  annulee: "mute",
};

export function faceLabel(status: DeskFaceStatus) {
  return FACE_LABEL[status];
}

export function faceTone(status: DeskFaceStatus) {
  return FACE_TONE[status];
}

/** Proposée tant que le message n’est pas parti. Refusée si le client a dit non. À annuler si l’autre table est acceptée. */
export function faceStatus(input: {
  hasRestaurant: boolean;
  status: TableStatus;
  sent: boolean;
  otherAccepted: boolean;
}): DeskFaceStatus {
  if (!input.hasRestaurant && input.status !== "annulee") return "a_choisir";
  if (input.status === "annulee") return "annulee";
  if (input.status === "choisie") return "acceptee";
  if (input.status === "a_annuler") return input.otherAccepted ? "a_annuler" : "refusee";
  if (input.sent || input.status === "proposee") return "envoyee";
  return "proposee";
}

export function eveningPhase(statuses: DeskFaceStatus[]): DeskPhase {
  if (statuses.some((status) => status === "a_choisir")) return "choisir";
  if (statuses.some((status) => status === "a_annuler" || status === "refusee")) return "annuler";
  if (statuses.length === 2 && statuses.every((status) => status === "proposee")) return "envoyer";
  return "attendre";
}

export function ficheGaps(input: {
  photoUrls: string[];
  signaturePhotoUrl: string;
  pitch: string;
  priceBand: string;
  placeUrl: string;
  website: string;
}) {
  const gaps: string[] = [];
  if (!input.photoUrls.some((url) => url.startsWith("https://") || url.startsWith("/"))) gaps.push("photo de la salle");
  if (!input.signaturePhotoUrl) gaps.push("photo du plat");
  if (!input.pitch.trim()) gaps.push("description");
  if (!input.priceBand.trim()) gaps.push("fourchette");
  const link = input.placeUrl || input.website;
  if (!link.startsWith("https://") && !link.startsWith("/")) gaps.push("lien");
  return gaps;
}

export function ficheComplete(input: Parameters<typeof ficheGaps>[0]) {
  return ficheGaps(input).length === 0;
}

/** Pourquoi Envoyer au client est éteint. La liste d’essai passe avant tout, sauf en mode test (numéro de test seul). */
export function sendBlockReason(input: {
  gaps: string[];
  templatesReady: boolean;
  test: boolean;
  testPhone: boolean;
  alreadySent: boolean;
  hasClientPhone: boolean;
  /** Dossier dans `RESTAURANT_ALLOWED_BOOKINGS`. */
  allowed: boolean;
}) {
  if (!input.test && !input.allowed) return RESTAURANT_ALLOWLIST_BLOCK;
  if (input.alreadySent) return "Déjà envoyé.";
  if (input.gaps.length) return `Fiche incomplète : ${input.gaps.join(", ")}.`;
  if (input.test) {
    if (!input.testPhone) return "Numéro de test absent. Renseignez RESTAURANT_TEST_PHONE.";
    return null;
  }
  if (!input.hasClientPhone) return "Ce client n’a pas de numéro WhatsApp.";
  if (!input.templatesReady) return "Le modèle WhatsApp n’est pas encore approuvé par Meta.";
  return null;
}

export function eveningBanner(rows: { phase: DeskPhase; clicks: number; faces: DeskFaceStatus[] }[]) {
  return {
    envoyer: rows.filter((row) => row.phase === "envoyer").length,
    annuler: rows.filter((row) => row.phase === "annuler").length,
    reponses: rows.filter(
      (row) => row.clicks > 0 || row.faces.some((status) => status === "acceptee" || status === "refusee")
    ).length,
  };
}

export function countdownUntilClose(now: Date, eveningDate: string, timeZone: string | null) {
  if (!timeZone) return { label: "Fuseau inconnu", over: false, at: null as number | null };
  const at = zonedInstant(eveningDate, 18, 0, timeZone);
  if (at == null) return { label: "Fuseau inconnu", over: false, at: null };
  const delta = at - now.getTime();
  if (delta <= 0) return { label: "18 h passées", over: true, at };
  const minutes = Math.floor(delta / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const label = hours > 0 ? `${hours} h ${String(rest).padStart(2, "0")}` : `${rest} min`;
  return { label, over: false, at };
}

export function seatsOf(statusBySeat: { seat: TableSeat; status: DeskFaceStatus }[]) {
  return (["A", "B"] as const).map((seat) => statusBySeat.find((row) => row.seat === seat)?.status || "a_choisir");
}
