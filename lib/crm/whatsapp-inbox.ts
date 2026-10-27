/** Fil WhatsApp de l’agence : regroupement, non-lus, fenêtre de 24 h, pastilles. */

export type InboxSpeaker = "client" | "robot" | "agency";
export type InboxThreadStatus = "robot" | "agency" | "escalated";
export type InboxFilter = "tous" | "non-lus" | "robot" | "agence" | "escalade" | "prospects";

export type InboxMessage = {
  id: string;
  phone: string | null;
  customerId: string | null;
  customerName: string | null;
  bookingId: string | null;
  bookingReference: string | null;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  status: string | null;
  /** Raison française d’un échec Twilio. Vide tant que le message n’a pas échoué. */
  error?: string | null;
  templateKey: string | null;
  authorName: string | null;
  mediaPath: string | null;
  tools: string[];
  requestId: string | null;
  /** Note d’agence sur une réponse du Concierge. */
  conciergeMark?: "good" | "bad" | null;
};

export type InboxThread = {
  key: string;
  phone: string | null;
  customerId: string | null;
  customerName: string | null;
  prospect: boolean;
  bookingId: string | null;
  bookingReference: string | null;
  lastBody: string;
  lastAt: string;
  unread: number;
  status: InboxThreadStatus;
  /** Vrai tant qu’un humain tient le fil (pause encore active). */
  held?: boolean;
};

const DAY = 24 * 60 * 60 * 1000;

export function threadKey(row: { phone?: string | null; customerId?: string | null }) {
  return (row.phone || "").trim() || row.customerId || "";
}

export function messageSpeaker(row: Pick<InboxMessage, "direction" | "authorName" | "templateKey">): InboxSpeaker {
  if (row.direction === "inbound") return "client";
  if (row.authorName || row.templateKey === "staff" || row.templateKey === "agence") return "agency";
  return "robot";
}

export function deliveryCaption(status: string | null | undefined, error?: string | null) {
  const failed = (status || "").toLowerCase() === "failed" || (status || "").toLowerCase() === "undelivered";
  const label = deliveryLabel(failed ? "failed" : status);
  if (!failed) return label;
  const reason = (error || "").replace(/https?:\/\/\S+/g, "").replace(/\+?\d{8,}/g, "").replace(/\s+/g, " ").trim();
  if (!reason) return label || "Échec";
  return `${label || "Échec"} · ${reason}`;
}

export function deliveryLabel(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "queued":
      return "En file";
    case "sent":
      return "Envoyé";
    case "delivered":
      return "Reçu";
    case "read":
      return "Lu";
    case "failed":
      return "Échec";
    case "received":
      return "Reçu";
    default:
      return "";
  }
}

export function parisStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function readStamp(now = new Date()) {
  return now.toISOString();
}

export function pauseStillActive(until: string | null | undefined, now = new Date()) {
  if (!until) return false;
  const at = new Date(until).getTime();
  return !Number.isNaN(at) && at > now.getTime();
}

export function sessionWindowOpenNow(lastInboundIso: string | null) {
  return sessionWindowOpen(lastInboundIso, new Date());
}

export function sessionWindowOpen(lastInboundIso: string | null, now: Date) {
  if (!lastInboundIso) return false;
  const at = new Date(lastInboundIso).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < DAY;
}

export function foldThreads(
  messages: InboxMessage[],
  input: {
    readAt?: Record<string, string | null>;
    paused?: string[];
    escalated?: string[];
  }
): InboxThread[] {
  const readAt = input.readAt || {};
  const paused = new Set(input.paused || []);
  const escalated = new Set(input.escalated || []);
  const groups = new Map<string, InboxMessage[]>();
  for (const message of messages) {
    const key = threadKey(message);
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(message);
    groups.set(key, list);
  }
  const threads: InboxThread[] = [];
  for (const [key, rows] of groups) {
    const ordered = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = ordered[ordered.length - 1];
    const named = [...ordered].reverse().find((row) => row.customerName);
    const phone = [...ordered].reverse().find((row) => row.phone)?.phone || null;
    const customerId = [...ordered].reverse().find((row) => row.customerId)?.customerId || null;
    const booking = [...ordered].reverse().find((row) => row.bookingReference);
    const seen = readAt[key] || null;
    const unread = ordered.filter((row) => row.direction === "inbound" && (!seen || row.createdAt > seen)).length;
    const held = Boolean((phone && paused.has(phone)) || paused.has(key));
    const status: InboxThreadStatus = escalated.has(key) ? "escalated" : held ? "agency" : "robot";
    threads.push({
      key,
      phone,
      customerId,
      customerName: named?.customerName || null,
      prospect: !customerId,
      bookingId: booking?.bookingId || null,
      bookingReference: booking?.bookingReference || null,
      lastBody: last?.body || "",
      lastAt: last?.createdAt || "",
      unread: seen ? unread : last?.direction === "inbound" ? Math.min(unread, 1) : 0,
      status,
      held,
    });
  }
  return threads.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function filterThreads(threads: InboxThread[], input: { query?: string; filter?: InboxFilter }) {
  const query = (input.query || "").trim().toLowerCase();
  const filter = input.filter || "tous";
  return threads.filter((thread) => {
    if (filter === "non-lus" && thread.unread < 1) return false;
    if (filter === "robot" && thread.status !== "robot") return false;
    if (filter === "agence" && thread.status !== "agency") return false;
    if (filter === "escalade" && thread.status !== "escalated") return false;
    if (filter === "prospects" && !thread.prospect) return false;
    if (!query) return true;
    const hay = [thread.customerName, thread.phone, thread.bookingReference, thread.lastBody].join(" ").toLowerCase();
    return hay.includes(query);
  });
}

export function unreadThreadCount(threads: InboxThread[]) {
  return threads.filter((thread) => thread.unread > 0).length;
}

export function statusLabel(status: InboxThreadStatus) {
  if (status === "escalated") return "Escaladé";
  if (status === "agency") return "Repris par l’agence";
  return "Le Concierge";
}

/** Pastille du fil : qui répond, tout de suite après une remise ou une reprise. */
export function conversationBadge(status: InboxThreadStatus, held: boolean) {
  const holder = held ? "Repris par l’agence" : "Le Concierge";
  if (status === "escalated") return `Escaladé · ${holder}`;
  return holder;
}

/** Du plus récent au plus ancien : le dernier message est en haut à l’ouverture. */
export function messagesNewestFirst<T extends { createdAt: string; id: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function speakerLabel(speaker: InboxSpeaker, authorName: string | null) {
  if (speaker === "client") return "Client";
  if (speaker === "agency") return authorName || "L’agence";
  return "Le Concierge";
}

const MANUAL_TEMPLATES = [
  { key: "sejour_texte", env: "TWILIO_CONTENT_SEJOUR_TEXTE", label: "Le séjour est dans l’espace" },
  { key: "rappel", env: "TWILIO_CONTENT_RAPPEL_DEPART", label: "Rappel avant le départ" },
] as const;

/** Modèles déjà approuvés chez Meta, seulement s’ils ont un identifiant. Les brouillons n’y sont pas. */
export function approvedManualTemplates(env: Record<string, string | undefined> = process.env) {
  return MANUAL_TEMPLATES.filter((row) => (env[row.env] || "").trim()).map((row) => ({
    key: row.key,
    label: row.label,
  }));
}

export function draftTemplateRefused(key: string) {
  return key.startsWith("concierge_");
}
