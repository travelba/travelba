import { importTitleGuard } from "@/lib/crm/import-title";
import type { BookingExtract } from "./ingest-types";

/** Fichier corps de mail : son titre est souvent le sujet, pas le nom du séjour. */
export function isEmailBodyFile(name: string | null | undefined) {
  return (name || "").trim().toLowerCase() === "corps-email.txt";
}

/** Valeur initiale du champ sur la carte e-mail. */
export function emailCardTitle(input: {
  title?: string | null;
  destination?: string | null;
  subject?: string | null;
}): string {
  const title = (input.title || "").trim();
  if (title) return title;
  const destination = (input.destination || "").trim();
  if (destination) return destination;
  const subject = (input.subject || "").trim();
  if (subject) return subject;
  return "Réservation";
}

export function applyEditedExtractTitle<T extends object>(extract: T, title: string): T & { title: string } {
  return { ...extract, title: title.trim() };
}

/**
 * Titre à garder à la relecture. Un titre déjà choisi n’est pas remplacé
 * par le sujet du mail, même si l’extrait entrant le reprend.
 */
export function stayTitleForExtract(input: {
  chosen?: string | null;
  incoming?: string | null;
  emailSubject?: string | null;
}): string {
  const chosen = (input.chosen || "").trim();
  if (chosen) return chosen;
  const incoming = (input.incoming || "").trim();
  const subject = (input.emailSubject || "").trim();
  if (subject && incoming.localeCompare(subject, "fr", { sensitivity: "accent" }) === 0) {
    return "";
  }
  return incoming;
}

/** Titre enregistré sur le dossier. Le sujet du mail n’est pas un repli. */
export function dossierTitle(extract: Pick<BookingExtract, "title" | "destination">): string {
  return (extract.title || "").trim() || (extract.destination || "").trim() || "Voyage";
}

/**
 * Titre d’un import. Sans titre choisi, c’est la ville du séjour.
 * Le nom de l’hôtel reste sur la carte. « 40 ans » reste.
 */
export function dossierTitleFromImport(
  extract: Pick<BookingExtract, "title" | "destination" | "items">
): string {
  const guarded = importTitleGuard({
    title: extract.title,
    destination: extract.destination,
    items: extract.items || [],
  });
  return guarded.title || dossierTitle(extract);
}
