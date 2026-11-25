import { formatPhoneDisplay } from "./phone";

/** Numéro déjà stocké sur la carte (`details.phone`), affiché tel quel dans la description. */
export function transferProviderPhone(details: Record<string, unknown> | null | undefined): string {
  const raw = typeof details?.phone === "string" ? details.phone.trim() : "";
  if (!raw) return "";
  return formatPhoneDisplay(raw) || raw;
}

/**
 * Description d’un transfert, la même ligne qu’aujourd’hui : le nom s’il est connu, puis le numéro.
 * La référence reste à la fin. Rien d’autre.
 */
export function transferDescription(item: {
  supplier?: string | null;
  confirmation_ref?: string | null;
  visible_to_client?: boolean | null;
  details?: Record<string, unknown> | null;
}): string {
  const name = (item.supplier || "").trim();
  const phone = item.visible_to_client === false ? "" : transferProviderPhone(item.details);
  const ref = (item.confirmation_ref || "").trim();
  return [name, phone, ref].filter(Boolean).join(" · ");
}
