import { shortStayDay, shortStayRange } from "./staff-stay";
import { foldLetters } from "./text";

/** Posé quand une carte vient d’un devis mélangé à des confirmations. */
export const QUOTE_REVIEW_REASON = "Issue d’un devis, pas d’une confirmation.";

/** Confirmation hôtel encore provisoire (TENTATIVE). */
export const TENTATIVE_REVIEW_REASON = "Réservation provisoire (tentative).";

export type ReviewStep = {
  kind?: string | null;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function samePlace(a: string, b: string) {
  return Boolean(a && b && foldLetters(a) === foldLetters(b));
}

/** Phrase déjà écrite à l’extraction. Une valeur vide ou trop courte ne compte pas. */
export function storedReviewReason(details: Record<string, unknown> | null | undefined) {
  const reason = text(details?.review_reason);
  if (reason.length < 8 || !/[a-zà-ÿ]/i.test(reason)) return "";
  return /[.!?…]$/.test(reason) ? reason : `${reason}.`;
}

function stepName(item: ReviewStep) {
  const details = item.details || {};
  const title = text(item.title);
  if (item.kind === "hotel") {
    return text(details.hotel_name) || title || text(details.city) || "Hôtel";
  }
  if (item.kind === "flight" || item.kind === "rail") {
    const from = text(details.city_from);
    const to = text(details.city_to);
    if (from && to) return `${from} → ${to}`;
    return title || "Trajet";
  }
  return title || "Étape";
}

/** Nom de l’étape et ses dates, pour le bandeau. */
export function reviewStepLabel(item: ReviewStep) {
  const name = stepName(item);
  const when =
    item.kind === "hotel" || item.kind === "car"
      ? shortStayRange(item.start_at, item.end_at)
      : shortStayDay(item.start_at);
  return when ? `${name}, ${when}` : name;
}

/**
 * Ce qui est douteux sur une carte marquée `needs_review`.
 * La phrase enregistrée gagne. Sinon on lit le fichier et le nom.
 */
export function reviewDoubts(item: ReviewStep): string[] {
  const details = item.details || {};
  if (details.needs_review !== true) return [];
  const stored = storedReviewReason(details);
  if (stored) return [stored];

  const lines: string[] = [];
  const file = text(details.source_file_name);
  if (file && /\b(?:option|devis)\b/i.test(file)) {
    lines.push(`Le fichier « ${file} » est une option, pas une confirmation.`);
  }

  if (item.kind === "hotel") {
    const hotel = text(details.hotel_name);
    const city = text(details.city);
    const title = text(item.title);
    const name = hotel || title;
    if (city && samePlace(name, city)) {
      lines.push(
        hotel
          ? `Le nom lu est la ville (${city}), pas l’établissement.`
          : `Le nom de l’hôtel n’a pas été lu : la carte porte la ville (${city}).`
      );
    } else if (!hotel) {
      lines.push("Le nom de l’hôtel n’a pas été lu.");
    }
  }

  if (!lines.length) lines.push("La lecture est marquée douteuse, sans préciser le champ.");
  return lines;
}
