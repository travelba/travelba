import { formatPhoneDisplay } from "./phone";

/** Numéro déjà stocké sur la carte (`details.phone`). */
export function transferProviderPhone(details: Record<string, unknown> | null | undefined): string {
  const raw = typeof details?.phone === "string" ? details.phone.trim() : "";
  if (!raw) return "";
  return formatPhoneDisplay(raw) || raw;
}

/**
 * Nom et numéro, seulement dans le détail ouvert.
 * Vide si la carte est cachée au client, ou s’il n’y a ni nom ni numéro.
 */
export function transferOpenedLine(item: {
  supplier?: string | null;
  visible_to_client?: boolean | null;
  details?: Record<string, unknown> | null;
}): string {
  if (item.visible_to_client === false) return "";
  const name = (item.supplier || "").trim();
  const phone = transferProviderPhone(item.details);
  return [name, phone].filter(Boolean).join(" · ");
}
