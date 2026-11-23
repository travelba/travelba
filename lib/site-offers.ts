/** Emplacements du catalogue signature. Aucun voyage, prix ou promesse n’est inventé. */
export const SIGNATURE_SLOTS = ["01", "02", "03", "04"] as const;

export type SignatureSlot = (typeof SIGNATURE_SLOTS)[number];

export function signatureSlug(slot: SignatureSlot) {
  return `voyage-${slot}`;
}

export function signatureSlotFromSlug(slug: string): SignatureSlot | null {
  const match = /^voyage-(0[1-4])$/.exec(slug);
  if (!match) return null;
  return match[1] as SignatureSlot;
}

/**
 * Exemples d’inspiration, pas des adresses TBA.
 * Faits relus sur les sites des maisons (novembre 2026).
 */
export const FAMILY_RESORTS = [
  {
    id: "soneva",
    href: "https://soneva.com/resorts/soneva-fushi/experiences/theden/",
  },
  {
    id: "reethi",
    href: "https://www.oneandonlyresorts.com/reethi-rah/experiences/family",
  },
  {
    id: "borabora",
    href: "https://www.fourseasons.com/borabora/services-and-amenities/family/",
  },
] as const;
