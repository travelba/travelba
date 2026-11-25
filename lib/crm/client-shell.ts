import { portalNavigation, pushTargetPath } from "@/lib/crm/native-portal";

/** Ouverture de l’espace. L’enveloppe locale y va après le premier écran. */
export const SHELL_HOME = "https://travelba.fr/mon-compte";

const SHELL_BLOCKED = "https://travelba.fr/connexion?error=application";

export type ShellStay = {
  reference: string;
  title: string;
  when: string;
  href: string;
  place: string;
  upcoming: boolean;
};

export type ShellDocument = {
  id: string;
  name: string;
  type: string;
};

export type ClientShell = {
  userId: string;
  greeting: string;
  stays: ShellStay[];
  documents: ShellDocument[];
  savedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function safeReference(value: unknown) {
  const reference = clip(value, 40);
  if (!reference || /[/?#\\\s]/.test(reference) || reference.includes("..")) return "";
  return reference;
}

/** Six chiffres ou plus dans un nom : on ne garde pas un numéro de pièce. */
function publicFileName(value: unknown) {
  const name = clip(value, 80);
  if (!name || /\d{6,}/.test(name)) return "Pièce";
  return name;
}

export function sanitizeStay(input: unknown): ShellStay | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const reference = safeReference(row.reference);
  if (!reference) return null;
  return {
    reference,
    title: clip(row.title, 140) || "Séjour",
    when: clip(row.when, 80),
    href: `/mon-compte/reservations/${encodeURIComponent(reference)}`,
    place: clip(row.place, 140),
    upcoming: row.upcoming === true,
  };
}

export function sanitizeDocument(input: unknown): ShellDocument | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const id = clip(row.id, 36).toLowerCase();
  if (!UUID.test(id)) return null;
  return {
    id,
    name: publicFileName(row.name),
    type: clip(row.type, 32) || "other",
  };
}

export function sanitizeShell(input: unknown, now = ""): ClientShell | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const userId = clip(row.userId, 36).toLowerCase();
  if (!UUID.test(userId)) return null;
  const stays = Array.isArray(row.stays) ? row.stays.map(sanitizeStay).filter((stay): stay is ShellStay => Boolean(stay)).slice(0, 20) : [];
  const documents = Array.isArray(row.documents)
    ? row.documents.map(sanitizeDocument).filter((doc): doc is ShellDocument => Boolean(doc)).slice(0, 24)
    : [];
  return {
    userId,
    greeting: clip(row.greeting, 40),
    stays,
    documents,
    savedAt: clip(row.savedAt, 40) || now,
  };
}

/** Complète le cache de cette fiche. Une autre fiche repart de zéro. */
export function mergeShell(previous: ClientShell | null, patch: unknown, now: string): ClientShell | null {
  const next = sanitizeShell(patch, now);
  if (!next) return previous?.userId ? previous : null;
  if (!previous || previous.userId !== next.userId) return next;
  const patchRow = patch as Record<string, unknown>;
  return {
    userId: next.userId,
    greeting: next.greeting || previous.greeting,
    stays: Array.isArray(patchRow.stays) ? next.stays : previous.stays,
    documents: Array.isArray(patchRow.documents) ? next.documents : previous.documents,
    savedAt: now,
  };
}

export type ShellTarget = { action: "stay" | "open"; url: string | null };

/**
 * Première adresse de l’application. Hors ligne, l’écran local reste.
 * Un lien du portail s’ouvre sur travelba.fr. /admin va à la connexion.
 */
export function chooseShellTarget(input: { launchUrl?: string | null; pushUrl?: string | null; online: boolean }): ShellTarget {
  if (!input.online) return { action: "stay", url: null };
  const push = pushTargetPath(input.pushUrl || "");
  if (push) return { action: "open", url: `https://travelba.fr${push.startsWith("/") ? push : `/${push}`}` };
  const launch = (input.launchUrl || "").trim();
  if (!launch) return { action: "open", url: SHELL_HOME };
  const decision = portalNavigation({ url: launch });
  if (decision === "block") return { action: "open", url: SHELL_BLOCKED };
  if (decision !== "allow") return { action: "open", url: SHELL_HOME };
  let url: URL;
  try {
    url = new URL(launch);
  } catch {
    return { action: "open", url: SHELL_HOME };
  }
  if (url.protocol !== "https:") return { action: "open", url: SHELL_HOME };
  const host = url.hostname.toLowerCase();
  if (host !== "travelba.fr" && host !== "www.travelba.fr") return { action: "open", url: SHELL_HOME };
  url.protocol = "https:";
  url.hostname = "travelba.fr";
  return { action: "open", url: url.toString() };
}
