import type { AgencyAlert } from "./agency-alerts";
import type { HotelReplyNotice } from "./hotel-reply-notice";

export const OPEN_KEY = "travelba-hotel-reply-open";
export const DISMISSED_KEY = "travelba-hotel-reply-dismissed";
export const NOTIFIED_KEY = "tba-admin-os-notified";
export const POPUP_OWNER_KEY = "tba-admin-popup-owner";
export const NOTICES_EVENT = "tba-admin-notices";
export const VISIBLE_POPUPS = 1;
/** Au chargement, on ne reprend que les toutes dernières minutes, et trois au plus. */
export const POPUP_BACKLOG_MS = 3 * 60 * 1000;
export const POPUP_BACKLOG_MAX = 3;
const QUEUE_CAP = 30;

const ICONS: Record<string, string> = {
  "E-mail": "mail",
  WhatsApp: "chat",
  Concierge: "support_agent",
  Billet: "airplane_ticket",
  Paiement: "payments",
  "Passeport ouvert": "badge",
  "Carte ouverte": "credit_card",
  Export: "download",
  Remboursement: "receipt_long",
  "Connexions refusées": "lock",
  "Rôle modifié": "user_cog",
  Pliant: "credit_card",
  "L’hôtel a répondu": "hotel",
};

export function noticeIcon(kicker?: string) {
  if (!kicker) return "hotel";
  return ICONS[kicker] || "inbox";
}

export function popupWaitingLabel(count: number) {
  if (count <= 0) return "";
  if (count === 1) return "Encore une notification";
  return `Encore ${count} notifications`;
}

/** Réponse d’hôtel, ou paiement reçu. Le journal, Pliant, WhatsApp et le reste ne s’ouvrent pas. */
export function isPopupNotice(notice: { kicker?: string; hotel?: string; excerpt?: string }) {
  const kicker = (notice.kicker || "").trim();
  if (!kicker || kicker === "L’hôtel a répondu" || kicker === "Hôtel") return true;
  if (kicker !== "Paiement") return false;
  const text = `${notice.hotel || ""} ${notice.excerpt || ""}`;
  if (/refus|abandon|rejet|au-dessus du seuil|échou|prélèvement annulé/i.test(text)) return false;
  return /virement reçu|prélèvement sepa reçu|a réglé|paiement reçu/i.test(text);
}

/** Curseur au chargement : pas plus vieux que la petite fenêtre, jamais dans le futur. */
export function popupCursor(stored: string | null | undefined, now: number, backlogMs = POPUP_BACKLOG_MS) {
  const floorMs = now - backlogMs;
  const at = stored ? Date.parse(stored) : Number.NaN;
  if (!Number.isFinite(at) || at < floorMs) return new Date(floorMs).toISOString();
  if (at > now) return new Date(now).toISOString();
  return new Date(at).toISOString();
}

/** Les plus récentes, trois au plus. Le reste du lot ne s’ouvre pas. */
export function takePopupBacklog<T>(rows: T[], max = POPUP_BACKLOG_MAX) {
  if (max <= 0) return [];
  return rows.length <= max ? rows : rows.slice(-max);
}

export function asAdminNotice(alert: AgencyAlert): HotelReplyNotice {
  return {
    id: alert.id,
    bookingId: "",
    itemId: "",
    hotel: alert.title,
    excerpt: alert.body,
    receivedAt: alert.at,
    href: alert.href,
    kicker: alert.kicker,
  };
}

export function isAdminNotice(value: unknown): value is HotelReplyNotice {
  if (!value || typeof value !== "object") return false;
  const notice = value as HotelReplyNotice;
  return Boolean(notice.id && notice.href && notice.hotel);
}

/** La file déjà ouverte, plus les nouvelles. Une notification fermée ou déjà là ne revient pas. */
export function mergeAdminNotices(
  current: HotelReplyNotice[],
  incoming: HotelReplyNotice[],
  dismissed: ReadonlySet<string>
) {
  const seen = new Set<string>();
  const next: HotelReplyNotice[] = [];
  for (const notice of current) {
    if (!notice.id || dismissed.has(notice.id) || seen.has(notice.id)) continue;
    seen.add(notice.id);
    next.push(notice);
  }
  for (const notice of incoming) {
    if (!notice.id || dismissed.has(notice.id) || seen.has(notice.id)) continue;
    seen.add(notice.id);
    next.push(notice);
  }
  return next.slice(0, QUEUE_CAP);
}

/**
 * Un seul onglet visible montre la fenêtre.
 * L’onglet au premier plan prend la main. Un onglet en arrière-plan ne l’affiche pas.
 */
export function shouldShowAdminPopup(input: { selfId: string; ownerId: string | null; visible: boolean; focused: boolean }) {
  if (!input.visible) return false;
  if (!input.ownerId) return input.focused;
  return input.ownerId === input.selfId;
}

/** Identifiants pas encore annoncés par le système. Les autres ne sonnent plus. */
export function claimOsNotify(already: readonly string[], ids: readonly string[], cap = 200) {
  const seen = new Set(already);
  const fresh: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    fresh.push(id);
  }
  return { fresh, next: [...seen].slice(-cap) };
}
