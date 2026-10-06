/** Affichage ETA Royaume-Uni. Aucune donnée de passeport, aucun accès base. */

export const UK_ETA_STATUSES = [
  "a_verifier",
  "approuve",
  "introuvable",
  "refuse",
  "en_attente",
  "non_concerne",
  "erreur",
] as const;

export type UkEtaStatus = (typeof UK_ETA_STATUSES)[number];

export const UK_ETA_POLL_MS = 10_000;
export const UK_ETA_POLL_WINDOW_MS = 10 * 60 * 1000;
export const UK_ETA_PENDING_STALE_MS = 20 * 60 * 1000;

export type UkEtaTravelerLine = {
  travelerId: string;
  name: string;
  badge: string;
  tone: "ok" | "warn" | "muted";
  checkedLabel: string;
  caption: string | null;
  canVerify: boolean;
  canSend: boolean;
  sent: boolean;
  status: UkEtaStatus;
  checkedAt: string | null;
  requestedAt: string | null;
  validUntil: string | null;
};

export function isUkEtaStatus(value: string | null | undefined): value is UkEtaStatus {
  return Boolean(value && (UK_ETA_STATUSES as readonly string[]).includes(value));
}

function parisParts(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const day = pick("day");
  const month = pick("month");
  const hour = pick("hour");
  const minute = pick("minute");
  if (!day || !month || !hour || !minute) return null;
  return { day, month, hour, minute };
}

export function ukEtaCheckedLabel(checkedAt: string | null | undefined) {
  const parts = parisParts(checkedAt);
  if (!parts) return "Pas encore vérifié";
  return `Vérifié le ${parts.day}/${parts.month} à ${parts.hour}:${parts.minute}`;
}

/** Ligne de statut : en cours, relance après 20 min, ou heure de Paris de la vérification. */
export function ukEtaFeedback(input: {
  status: UkEtaStatus;
  checkedAt?: string | null;
  requestedAt?: string | null;
  nowMs: number;
}) {
  if (input.status === "a_verifier" && input.requestedAt) {
    const at = Date.parse(input.requestedAt);
    if (Number.isFinite(at) && input.nowMs - at >= UK_ETA_PENDING_STALE_MS) {
      return { pending: true, label: "Toujours en attente — relancée automatiquement" };
    }
    const parts = parisParts(input.requestedAt);
    const label = parts
      ? `Vérification en cours… demandée à ${parts.hour}:${parts.minute}`
      : "Vérification en cours…";
    return { pending: true, label };
  }
  return { pending: false, label: ukEtaCheckedLabel(input.checkedAt) };
}
