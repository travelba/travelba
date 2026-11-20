import { whatsappAlert, type InboundChatAlert } from "./agency-alerts";
import {
  asAdminNotice,
  claimOsNotify,
  DISMISSED_KEY,
  isAdminNotice,
  mergeAdminNotices,
  NOTICES_EVENT,
  NOTIFIED_KEY,
  OPEN_KEY,
  POPUP_OWNER_KEY,
} from "./admin-popup";
import { browserAlert } from "./browser-alert";
import type { HotelReplyNotice } from "./hotel-reply-notice";
import { TAB_CHANNEL } from "./tab-leader";

function readList(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // La liste reste dans cet onglet.
  }
}

export function readAdminNotices() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OPEN_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isAdminNotice) : [];
  } catch {
    return [];
  }
}

function writeAdminNotices(notices: HotelReplyNotice[]) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(notices));
  } catch {
    // La file reste dans cet onglet.
  }
}

export function readDismissedNotices() {
  return new Set(readList(DISMISSED_KEY));
}

export function readPopupOwner() {
  try {
    const value = localStorage.getItem(POPUP_OWNER_KEY);
    return value || null;
  } catch {
    return null;
  }
}

export function writePopupOwner(id: string) {
  try {
    localStorage.setItem(POPUP_OWNER_KEY, id);
  } catch {
    // Sans stockage partagé, cet onglet décide seul.
  }
}

export function clearPopupOwner(id: string) {
  try {
    if (localStorage.getItem(POPUP_OWNER_KEY) === id) localStorage.removeItem(POPUP_OWNER_KEY);
  } catch {
    // Rien à libérer.
  }
}

function nudge() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTICES_EVENT));
  try {
    const channel = new BroadcastChannel(TAB_CHANNEL);
    channel.postMessage({ type: "queue" });
    channel.close();
  } catch {
    // Les autres onglets liront le stockage.
  }
}

/** Les notifications déjà à l’écran ne sonnent plus au rechargement. */
export function suppressOsNotices(ids: string[]) {
  if (typeof window === "undefined" || !ids.length) return;
  const { next } = claimOsNotify(readList(NOTIFIED_KEY), ids);
  writeList(NOTIFIED_KEY, next);
}

/**
 * Ajoute les notifications nouvelles, une fois par identifiant.
 * Le système ne sonne que pour celles qui n’ont pas encore sonné, sur un seul onglet.
 */
export function deliverAdminNotices(incoming: HotelReplyNotice[]) {
  if (typeof window === "undefined" || !incoming.length) return [];
  const current = readAdminNotices();
  const next = mergeAdminNotices(current, incoming, readDismissedNotices());
  const added = next.filter((notice) => !current.some((row) => row.id === notice.id));
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    writeAdminNotices(next);
    nudge();
  }
  if (!added.length) return [];
  const { fresh, next: notified } = claimOsNotify(
    readList(NOTIFIED_KEY),
    added.map((notice) => notice.id)
  );
  writeList(NOTIFIED_KEY, notified);
  for (const notice of added) {
    if (!fresh.includes(notice.id)) continue;
    browserAlert({
      id: notice.id,
      title: notice.kicker || "L’hôtel a répondu",
      body: `${notice.hotel}. ${notice.excerpt}`,
      href: notice.href,
    });
  }
  return added;
}

export function deliverWhatsappNotice(input: InboundChatAlert) {
  const alert = whatsappAlert(input);
  if (!alert) return;
  deliverAdminNotices([asAdminNotice(alert)]);
}

export function dismissAdminNotice(id: string) {
  if (typeof window === "undefined" || !id) return;
  const ids = readList(DISMISSED_KEY);
  if (!ids.includes(id)) ids.push(id);
  writeList(DISMISSED_KEY, ids.slice(-200));
  writeAdminNotices(readAdminNotices().filter((notice) => notice.id !== id));
  nudge();
}
