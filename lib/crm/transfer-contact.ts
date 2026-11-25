import { formatPhoneDisplay, toE164 } from "./phone";

/** Téléphone du prestataire, stocké en E.164. Champ déjà présent : `details.phone`. */
export const TRANSFER_PHONE_ERROR =
  "Téléphone du prestataire : indiquez un numéro au format international, par exemple +33612345678.";

export const TRANSFER_CONTACT_KIND_ERROR =
  "Le contact du prestataire se renseigne sur une carte transfert.";

export type TransferContact = {
  name: string;
  driver: string;
  phone: string;
  label: string;
  tel: string;
  whatsapp: string;
};

/** Numéro utilisable, ou null. Un 06 français devient +33. Un numéro invalide reste null. */
export function transferPhoneE164(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  return toE164(raw) || toE164(raw, "FR");
}

/**
 * Contact montré au client. `supplier` est le prestataire, `details.driver` le chauffeur,
 * `details.phone` le téléphone. Rien si la carte est cachée ou si le téléphone manque.
 * Ni prix d’achat, ni note interne.
 */
export function transferClientContact(item: {
  kind?: string | null;
  supplier?: string | null;
  visible_to_client?: boolean | null;
  details?: Record<string, unknown> | null;
}): TransferContact | null {
  if (item.kind !== "transfer") return null;
  if (item.visible_to_client === false) return null;
  const phone = transferPhoneE164(item.details?.phone);
  if (!phone) return null;
  const name = (item.supplier || "").trim().slice(0, 120);
  const driverRaw = typeof item.details?.driver === "string" ? item.details.driver.trim().slice(0, 120) : "";
  const driver = driverRaw && driverRaw.localeCompare(name, "fr", { sensitivity: "accent" }) !== 0 ? driverRaw : "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return {
    name,
    driver,
    phone,
    label: formatPhoneDisplay(phone) || phone,
    tel: `tel:${phone}`,
    whatsapp: `https://wa.me/${digits}`,
  };
}

function detailRecord(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

/**
 * Écrit prestataire (`supplier`), téléphone (`details.phone`) et chauffeur (`details.driver`).
 * Les autres détails restent. La visibilité n’est pas dans le résultat.
 */
export function applyTransferContact(input: {
  kind: string | null | undefined;
  supplier?: string | null;
  details?: Record<string, unknown> | null;
  prestataire?: unknown;
  telephone?: unknown;
  chauffeur?: unknown;
  setPrestataire: boolean;
  setTelephone: boolean;
  setChauffeur: boolean;
}):
  | { ok: true; supplier: string | null; details: Record<string, unknown>; changed: boolean }
  | { ok: false; error: string } {
  const supplier = (input.supplier || "").trim() || null;
  const details = detailRecord(input.details);
  if (!input.setPrestataire && !input.setTelephone && !input.setChauffeur) {
    return { ok: true, supplier, details, changed: false };
  }
  if (input.kind !== "transfer") return { ok: false, error: TRANSFER_CONTACT_KIND_ERROR };
  let nextSupplier = supplier;
  if (input.setPrestataire) {
    if (input.prestataire != null && typeof input.prestataire !== "string") {
      return { ok: false, error: "Prestataire : un nom." };
    }
    nextSupplier = (typeof input.prestataire === "string" ? input.prestataire.trim().slice(0, 120) : "") || null;
  }
  if (input.setTelephone) {
    if (input.telephone != null && typeof input.telephone !== "string") {
      return { ok: false, error: TRANSFER_PHONE_ERROR };
    }
    const raw = typeof input.telephone === "string" ? input.telephone.trim() : "";
    if (!raw) delete details.phone;
    else {
      const phone = transferPhoneE164(raw);
      if (!phone) return { ok: false, error: TRANSFER_PHONE_ERROR };
      details.phone = phone;
    }
  }
  if (input.setChauffeur) {
    if (input.chauffeur != null && typeof input.chauffeur !== "string") {
      return { ok: false, error: "Chauffeur : un nom." };
    }
    const driver = typeof input.chauffeur === "string" ? input.chauffeur.trim().slice(0, 120) : "";
    if (!driver) delete details.driver;
    else details.driver = driver;
  }
  return { ok: true, supplier: nextSupplier, details, changed: true };
}
