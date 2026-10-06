/** Affichage ETA Royaume-Uni. Aucune donnée de passeport, aucun accès réseau. */

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

export const UK_ETA_PENDING_STALE_MS = 20 * 60 * 1000;
export const UK_ETA_POLL_INTERVAL_MS = 10_000;
export const UK_ETA_POLL_WINDOW_MS = 10 * 60 * 1000;
export const UK_ETA_PENDING_LABEL = "Vérification en cours…";
export const UK_ETA_STALE_LABEL = "Toujours en attente — relancée automatiquement";

export function isUkEtaStatus(value: string | null | undefined): value is UkEtaStatus {
  return Boolean(value && (UK_ETA_STATUSES as readonly string[]).includes(value));
}

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
  pending: boolean;
  stale: boolean;
  requestedAt: string | null;
  checkedAt: string | null;
};

function parisClockParts(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
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
  if (day.length !== 2 || month.length !== 2 || hour.length !== 2 || minute.length !== 2) return null;
  return { day, month, hour, minute };
}

/** Heure de Paris, `HH:MM`. */
export function formatUkEtaClock(value: string | null | undefined) {
  const parts = parisClockParts(value);
  return parts ? `${parts.hour}:${parts.minute}` : null;
}

export function ukEtaCheckedLabel(checkedAt: string | null | undefined) {
  const parts = parisClockParts(checkedAt);
  if (!parts) return "Pas encore vérifié";
  return `Vérifié le ${parts.day}/${parts.month} à ${parts.hour}:${parts.minute}`;
}

export function ukEtaRequestedLabel(requestedAt: string | null | undefined) {
  const clock = formatUkEtaClock(requestedAt);
  return clock ? `demandée à ${clock}` : "demandée";
}

/** Horodatage le plus récent entre l’envoi réussi et la tentative. */
export function ukEtaRequestAt(input: { dispatchedAt?: string | null; attemptAt?: string | null }) {
  const marks = [input.dispatchedAt, input.attemptAt]
    .map((value) => {
      const iso = String(value || "").trim();
      const ms = Date.parse(iso);
      return iso && Number.isFinite(ms) ? { iso, ms } : null;
    })
    .filter((mark): mark is { iso: string; ms: number } => Boolean(mark));
  marks.sort((a, b) => b.ms - a.ms);
  return marks[0]?.iso || null;
}

/** Envoyée, et pas encore de résultat plus récent que cet envoi. */
export function ukEtaCheckPending(input: {
  dispatchedAt?: string | null;
  attemptAt?: string | null;
  checkedAt?: string | null;
}) {
  const requested = ukEtaRequestAt(input);
  if (!requested) return false;
  const requestedMs = Date.parse(requested);
  if (!Number.isFinite(requestedMs)) return false;
  if (!input.checkedAt) return true;
  const checkedMs = Date.parse(input.checkedAt);
  if (!Number.isFinite(checkedMs)) return true;
  return checkedMs < requestedMs;
}

export function ukEtaRequestStale(requestedAt: string | null | undefined, nowMs: number) {
  if (!requestedAt) return false;
  const requestedMs = Date.parse(requestedAt);
  if (!Number.isFinite(requestedMs)) return false;
  return nowMs - requestedMs >= UK_ETA_PENDING_STALE_MS;
}

/** Badge d’attente, sans reprendre l’ancien résultat. */
export function ukEtaLineAsPending(line: UkEtaTravelerLine, requestedAt: string, nowMs = Date.now()): UkEtaTravelerLine {
  const stale = ukEtaRequestStale(requestedAt, nowMs);
  return {
    ...line,
    badge: stale ? UK_ETA_STALE_LABEL : UK_ETA_PENDING_LABEL,
    tone: "warn",
    checkedLabel: ukEtaRequestedLabel(requestedAt),
    caption: null,
    canSend: false,
    pending: true,
    stale,
    requestedAt,
  };
}

/**
 * Le serveur fait foi dès qu’il a un envoi ou un résultat plus récent.
 * Sinon on garde l’attente affichée au clic, le temps que l’horodatage arrive.
 */
export function mergeUkEtaPoll(local: UkEtaTravelerLine[], incoming: UkEtaTravelerLine[], nowMs = Date.now()): UkEtaTravelerLine[] {
  if (!incoming.length) return local;
  const previous = new Map(local.map((row) => [row.travelerId, row]));
  return incoming.map((line) => {
    const prior = previous.get(line.travelerId);
    if (!prior?.pending || line.pending) return line;
    const priorMs = Date.parse(prior.requestedAt || "");
    if (!Number.isFinite(priorMs)) return line;
    const checkedMs = Date.parse(line.checkedAt || "");
    if (Number.isFinite(checkedMs) && checkedMs >= priorMs) return line;
    const serverRequest = Date.parse(line.requestedAt || "");
    if (Number.isFinite(serverRequest) && serverRequest >= priorMs) return line;
    return ukEtaLineAsPending(line, prior.requestedAt || new Date(nowMs).toISOString(), nowMs);
  });
}
