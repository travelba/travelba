/** Pause du Concierge jusqu’au lendemain matin, heure de Paris. */

/** L’humain a le fil : sans geste de sa part pendant ce délai, le Concierge reprend. */
export const TAKEOVER_IDLE_MS = 5 * 60 * 1000;

/** Ligne système du fil admin. Rien n’est envoyé au client. */
export const HANDOFF_TEMPLATE_KEY = "systeme";

export function threadIsPaused(until: string | null | undefined, now: Date) {
  if (!until) return false;
  const end = new Date(until).getTime();
  return Number.isFinite(end) && end > now.getTime();
}

function parisParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour: pick("hour") };
}

function parisHour(date: Date) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date)
  );
}

function parisDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 8 h le lendemain, à Paris. */
export function nextParisMorning(now: Date) {
  const today = parisParts(now);
  const day = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  let cursor = new Date(Date.UTC(today.year, today.month - 1, today.day + 1, 6, 0, 0));
  for (let step = 0; step < 8; step += 1) {
    if (parisDay(cursor) > day && parisHour(cursor) === 8) return cursor;
    cursor = new Date(cursor.getTime() + (8 - parisHour(cursor)) * 3_600_000);
  }
  return cursor;
}

/** « Conversation rendue au Concierge à 14h32 », heure de Paris. */
export function handoffSystemBody(now: Date) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = (parts.find((part) => part.type === "hour")?.value || "").replace(/\D/g, "").padStart(2, "0");
  const minute = (parts.find((part) => part.type === "minute")?.value || "").replace(/\D/g, "").padStart(2, "0");
  return `Conversation rendue au Concierge à ${hour}h${minute}`;
}

export function isHandoffNote(row: { templateKey?: string | null; template_key?: string | null }) {
  return (row.templateKey || row.template_key) === HANDOFF_TEMPLATE_KEY;
}

export type TakeoverBeat = {
  at: string;
  direction: "inbound" | "outbound";
  /** Message écrit par l’agence (auteur ou modèle staff). La ligne système ne compte pas. */
  human: boolean;
  system: boolean;
  body: string;
};

export function beatFromMessage(row: {
  direction: string;
  template_key?: string | null;
  author_staff_id?: string | null;
  created_at: string;
  body?: string | null;
}): TakeoverBeat {
  const template = row.template_key || null;
  const system = template === HANDOFF_TEMPLATE_KEY;
  const human =
    row.direction === "outbound" &&
    !system &&
    (Boolean(row.author_staff_id) || template === "staff" || template === "agence");
  return {
    at: row.created_at,
    direction: row.direction === "inbound" ? "inbound" : "outbound",
    human,
    system,
    body: (row.body || "").trim(),
  };
}

export type TakeoverDecision = {
  due: boolean;
  /** open : le Concierge a déjà le fil. fresh : l’humain a agi il y a moins de 5 min. waiting : un message client a moins de 5 min. idle : silence humain, rien à répondre. unanswered : message client sans réponse depuis 5 min. */
  reason: "open" | "fresh" | "waiting" | "idle" | "unanswered";
  unansweredText: string;
  unansweredAt: string[];
};

function latest(times: string[]) {
  return times.filter(Boolean).sort().at(-1) || "";
}

/**
 * Le fil est tenu par un humain.
 * On le rend si sa dernière activité (message ou reprise en main) a au moins 5 minutes,
 * et, s’il y a un message client sans réponse, si ce message a lui aussi au moins 5 minutes.
 * La reprise en main (`pausedAt`) relance l’horloge, sans compter comme une réponse.
 */
export function takeoverIdleDue(input: {
  pausedUntil: string | null | undefined;
  pausedAt?: string | null;
  beats: TakeoverBeat[];
  now: Date;
}): TakeoverDecision {
  const empty = { due: false, unansweredText: "", unansweredAt: [] as string[] };
  if (!threadIsPaused(input.pausedUntil, input.now)) return { ...empty, reason: "open" };
  const humanAt = latest(input.beats.filter((beat) => beat.human).map((beat) => beat.at));
  const activityAt = latest([humanAt, input.pausedAt || ""]);
  if (!activityAt) return { ...empty, reason: "fresh" };
  const idle = input.now.getTime() - new Date(activityAt).getTime();
  if (!Number.isFinite(idle) || idle < TAKEOVER_IDLE_MS) return { ...empty, reason: "fresh" };
  const unanswered = input.beats
    .filter((beat) => beat.direction === "inbound" && beat.body && (!humanAt || beat.at > humanAt))
    .sort((a, b) => a.at.localeCompare(b.at));
  if (unanswered.length) {
    const age = input.now.getTime() - new Date(unanswered[0].at).getTime();
    if (!Number.isFinite(age) || age < TAKEOVER_IDLE_MS) return { ...empty, reason: "waiting" };
    return {
      due: true,
      reason: "unanswered",
      unansweredText: unanswered.map((beat) => beat.body).join("\n"),
      unansweredAt: unanswered.map((beat) => beat.at),
    };
  }
  return { due: true, reason: "idle", unansweredText: "", unansweredAt: [] };
}

/** Vrai si ce message entrant a déjà une suite (réponse ou ligne de remise). Évite un second envoi. */
export function inboundAlreadyHandled(beats: TakeoverBeat[]) {
  const inbound = beats.filter((beat) => beat.direction === "inbound").sort((a, b) => a.at.localeCompare(b.at));
  const last = inbound.at(-1);
  if (!last) return false;
  return beats.some((beat) => beat.at > last.at && (beat.system || beat.direction === "outbound"));
}

export function agencySignoff(body: string) {
  const trimmed = body.replace(/\s+$/u, "").trim();
  if (trimmed.endsWith("L’agence")) return trimmed;
  return `${trimmed}\n\nL’agence`;
}
