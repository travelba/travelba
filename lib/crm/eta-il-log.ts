import type { ClientVisaStep } from "./visa-flow";

const PORTAL_HOST = "israel-entry.piba.gov.il";

export const PORTAL_LOG_KINDS = ["ouvert", "echec", "page", "champ", "attente", "erreur", "fini"] as const;

export type PortalLogKind = (typeof PORTAL_LOG_KINDS)[number];

export type PortalLogEvent = {
  at: string;
  kind: PortalLogKind;
  text: string;
};

export const PORTAL_KIND_LABEL: Record<PortalLogKind, string> = {
  ouvert: "Portail",
  echec: "Échec",
  page: "Page",
  champ: "Champ",
  attente: "Attente",
  erreur: "Erreur",
  fini: "Terminé",
};

export function clipPortalText(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 240) return clean;
  return `${clean.slice(0, 239)}…`;
}

export function safePortalLabel(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== PORTAL_HOST) return "page hors portail";
    return parsed.pathname || "/";
  } catch {
    return "page inconnue";
  }
}

/** Une ligne de journal. La valeur saisie n’est jamais recopiée : un champ de passeport y passerait. */
export function eventForPortalAction(step: {
  action: string;
  url?: string;
  target?: string;
  text?: string;
  summary?: string;
}): { kind: PortalLogKind; text: string } | null {
  if (step.action === "open") return { kind: "page", text: safePortalLabel(step.url || "") };
  if (step.action === "click") return { kind: "page", text: clipPortalText(`Clic · ${step.target || "contrôle"}`) };
  if (step.action === "type") return { kind: "champ", text: clipPortalText(`Champ « ${step.target || "champ"} »`) };
  if (step.action === "scroll") return { kind: "page", text: "Défilement" };
  if (step.action === "hold") {
    return { kind: "attente", text: clipPortalText(step.summary || "En attente de confirmation avant l’envoi.") };
  }
  return null;
}

export function portalEvent(kind: PortalLogKind, text: string, at = new Date().toISOString()): PortalLogEvent {
  return { at, kind, text: clipPortalText(text) };
}

/** Succès : validation, l’agent confirme avant l’envoi. Échec : on quitte Remplissage. */
export function stepAfterPortalRun(phase: string): ClientVisaStep {
  return phase === "à confirmer" ? "validation" : "preparation";
}

export function portalMonitorNote(step: string | null | undefined, events: { kind: string }[]) {
  if (step === "remplissage" && events.length === 0) {
    return "Le portail n’a pas pu s’ouvrir. Aucune trace de remplissage.";
  }
  return null;
}

export function portalRunLive(step: string | null | undefined, events: { kind: string }[]) {
  if (step === "remplissage") return true;
  const last = events.at(-1);
  if (!last) return false;
  return last.kind === "ouvert" || last.kind === "page" || last.kind === "champ" || last.kind === "attente";
}
