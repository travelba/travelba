import type { InboxMessage, InboxThread, InboxThreadStatus } from "./whatsapp-inbox";
import { threadKey } from "./whatsapp-inbox";

/** Onglets visibles avant le menu de débordement. */
export const DOCK_TAB_LIMIT = 4;
export const DOCK_STORAGE_KEY = "tba-wa-dock";

export type DockTab = { key: string; expanded: boolean };

export type DockState = { panelOpen: boolean; tabs: DockTab[] };

export function dockLabel(thread: Pick<InboxThread, "customerName" | "phone">) {
  return thread.customerName || thread.phone || "Numéro inconnu";
}

export function dockInitials(thread: Pick<InboxThread, "customerName" | "phone">) {
  const name = (thread.customerName || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  }
  const digits = (thread.phone || "").replace(/\D/g, "");
  return digits.slice(-2) || "?";
}

export function dockStatusLabel(status: InboxThreadStatus) {
  if (status === "agency") return "Agence";
  if (status === "escalated") return "Escaladé";
  return "Concierge";
}

export function emptyDockState(): DockState {
  return { panelOpen: false, tabs: [] };
}

export function readDockState(raw: string | null): DockState {
  if (!raw) return emptyDockState();
  try {
    const data = JSON.parse(raw) as { panelOpen?: unknown; tabs?: unknown };
    const tabs = Array.isArray(data.tabs)
      ? data.tabs.flatMap((row) => {
          if (!row || typeof row !== "object") return [];
          const key = String((row as { key?: unknown }).key || "").trim();
          if (!key || key.length > 40) return [];
          return [{ key, expanded: (row as { expanded?: unknown }).expanded === true }];
        })
      : [];
    const expanded = tabs.filter((tab) => tab.expanded);
    const normalized =
      expanded.length <= 1
        ? tabs
        : tabs.map((tab, index) => ({ ...tab, expanded: index === tabs.findIndex((item) => item.expanded) }));
    return { panelOpen: data.panelOpen === true, tabs: normalized.slice(0, 12) };
  } catch {
    return emptyDockState();
  }
}

/** Un seul onglet déplié. Le nouveau se place à droite. */
export function openDockTab(tabs: DockTab[], key: string, expand: boolean): DockTab[] {
  const rest = tabs.filter((tab) => tab.key !== key).map((tab) => (expand ? { ...tab, expanded: false } : tab));
  return [...rest, { key, expanded: expand }].slice(-12);
}

export function ensureDockTab(tabs: DockTab[], key: string): DockTab[] {
  if (tabs.some((tab) => tab.key === key)) return tabs;
  return [...tabs, { key, expanded: false }].slice(-12);
}

export function closeDockTab(tabs: DockTab[], key: string) {
  return tabs.filter((tab) => tab.key !== key);
}

export function collapseDockTab(tabs: DockTab[], key: string) {
  return tabs.map((tab) => (tab.key === key ? { ...tab, expanded: false } : tab));
}

/** L’onglet déplié reste visible. Les autres passent dans le menu. */
export function splitDockTabs(tabs: DockTab[], max = DOCK_TAB_LIMIT) {
  if (tabs.length <= max) return { visible: tabs, overflow: [] as DockTab[] };
  const expanded = tabs.find((tab) => tab.expanded);
  const rest = tabs.filter((tab) => tab.key !== expanded?.key);
  const visible = expanded ? [...rest.slice(-(max - 1)), expanded] : tabs.slice(-max);
  const keys = new Set(visible.map((tab) => tab.key));
  return { visible, overflow: tabs.filter((tab) => !keys.has(tab.key)) };
}

/** Le message entrant remonte le fil et ajoute un non-lu. */
export function applyDockMessage(threads: InboxThread[], message: InboxMessage): InboxThread[] {
  const key = threadKey(message);
  if (!key) return threads;
  const existing = threads.find((thread) => thread.key === key);
  const next: InboxThread = existing
    ? {
        ...existing,
        phone: message.phone || existing.phone,
        customerId: message.customerId || existing.customerId,
        customerName: message.customerName || existing.customerName,
        prospect: !(message.customerId || existing.customerId),
        bookingId: message.bookingId || existing.bookingId,
        bookingReference: message.bookingReference || existing.bookingReference,
        lastBody: message.body,
        lastAt: message.createdAt,
        unread: message.direction === "inbound" ? existing.unread + 1 : existing.unread,
      }
    : {
        key,
        phone: message.phone,
        customerId: message.customerId,
        customerName: message.customerName,
        prospect: !message.customerId,
        bookingId: message.bookingId,
        bookingReference: message.bookingReference,
        lastBody: message.body,
        lastAt: message.createdAt,
        unread: message.direction === "inbound" ? 1 : 0,
        status: "robot",
      };
  return [next, ...threads.filter((thread) => thread.key !== key)].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function clearDockUnread(threads: InboxThread[], key: string) {
  return threads.map((thread) => (thread.key === key ? { ...thread, unread: 0 } : thread));
}

export function freshDockThreads(previous: InboxThread[], next: InboxThread[]) {
  return next.filter((thread) => {
    const old = previous.find((row) => row.key === thread.key);
    if (!thread.lastAt) return false;
    if (!old) return thread.unread > 0;
    return thread.lastAt > old.lastAt && thread.unread > old.unread;
  });
}
