/** Relance d’un e-mail parti sans réponse. Rien n’est envoyé ici : le texte se prépare, l’agence confirme. */

export const UNANSWERED_AFTER_MS = 48 * 60 * 60 * 1000;

const SIGN_OFF = /^(?:bien à vous|avec nos remerciements|cordialement|best regards|with our thanks),?$/i;
const AGENCY_LINE = /^travel business agency$/i;
const CARD_RUN = /(?:\d[ -]?){13,19}/;

export type FollowUpMark = {
  followUps: number;
  unanswered: boolean;
};

export type FollowUpTurn = {
  id: string;
  at: string;
  direction: "out" | "in";
  subjectKey: string;
  countsAsReply: boolean;
};

function parisDay(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });
}

/** Extrait court, sans formule de politesse ni numéro de carte. */
export function followUpExcerpt(body: string, max = 280) {
  const kept: string[] = [];
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (SIGN_OFF.test(trimmed) || AGENCY_LINE.test(trimmed)) break;
    if (CARD_RUN.test(trimmed)) continue;
    const clean = trimmed.replace(/\s+/g, " ").trim();
    if (clean) kept.push(clean);
  }
  const flat = kept.join(" ").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max).trimEnd()}…`;
}

/**
 * Brouillon français. L’objet `Re:` garde le même fil.
 * La formule et la signature restent éditables avant l’envoi.
 */
export function followUpBody(input: { body: string; sentAt?: string | null }) {
  const excerpt = followUpExcerpt(input.body);
  const when = parisDay(input.sentAt);
  const dated = when ? ` du ${when}` : "";
  const lines = [
    "Bonjour,",
    "",
    `Nous nous permettons de revenir vers vous au sujet de notre message${dated}, resté sans réponse.`,
    "",
  ];
  if (excerpt) lines.push(`« ${excerpt} »`, "");
  lines.push("Nous restons à votre disposition pour toute précision.", "", "Bien à vous,", "", "Travel Business Agency");
  return lines.join("\n");
}

/** Dernier envoi : la relance, sinon le message d’origine. */
export function outboundAnchor(sentAt: string | null | undefined, lastFollowUpAt?: string | null) {
  return lastFollowUpAt || sentAt || null;
}

/** Vrai après 48 h sans réponse. Un statut autre que parti ou à relancer ne compte pas. */
export function isUnanswered(input: {
  status: string;
  sentAt: string | null;
  lastFollowUpAt?: string | null;
  hasReply: boolean;
  nowMs: number;
}) {
  if (input.hasReply) return false;
  if (input.status !== "sent" && input.status !== "follow_up") return false;
  const anchor = outboundAnchor(input.sentAt, input.lastFollowUpAt);
  if (!anchor) return false;
  const at = Date.parse(anchor);
  if (!Number.isFinite(at)) return false;
  return input.nowMs - at >= UNANSWERED_AFTER_MS;
}

export function followUpCountLabel(count: number) {
  if (!Number.isFinite(count) || count < 1) return null;
  const n = Math.floor(count);
  return n === 1 ? "1 relance" : `${n} relances`;
}

/** Lien vers le bureau de l’hôtel, le brouillon de relance déjà ouvert. */
export function followUpHref(bookingId: string, itemId: string, mailId: string) {
  const params = new URLSearchParams({ hotel: itemId, relance: mailId });
  return `/admin/reservations/${bookingId}?${params.toString()}`;
}

/**
 * Dernier envoi de chaque fil, s’il n’a pas de réponse ensuite.
 * `followUps` compte les envois après le premier.
 */
export function followUpMarks(turns: FollowUpTurn[], nowMs: number) {
  const groups = new Map<string, FollowUpTurn[]>();
  for (const turn of turns) {
    if (!turn.subjectKey) continue;
    const list = groups.get(turn.subjectKey) || [];
    list.push(turn);
    groups.set(turn.subjectKey, list);
  }
  const marks = new Map<string, FollowUpMark>();
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const outs = ordered.filter((turn) => turn.direction === "out");
    const last = outs[outs.length - 1];
    if (!last) continue;
    const replied = ordered.some(
      (turn) => turn.direction === "in" && turn.countsAsReply && turn.id !== last.id && turn.at >= last.at
    );
    if (replied) continue;
    const at = Date.parse(last.at);
    marks.set(last.id, {
      followUps: Math.max(0, outs.length - 1),
      unanswered: Number.isFinite(at) && nowMs - at >= UNANSWERED_AFTER_MS,
    });
  }
  return marks;
}
