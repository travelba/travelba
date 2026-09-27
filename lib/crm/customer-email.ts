export const CUSTOMER_EMAIL_COPY = {
  invalid: "Indiquez une adresse e-mail valide.",
  taken: "Cette adresse est déjà utilisée par un autre client.",
  auth: "Le compte d’accès n’a pas suivi ce changement d’e-mail. Réessayez.",
} as const;

export function normalizeCustomerEmail(value: string) {
  return value.trim().toLowerCase();
}

export function customerEmailError(email: string): string | null {
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return CUSTOMER_EMAIL_COPY.invalid;
  }
  return null;
}

/** Refus si un autre client possède déjà cette adresse. */
export function otherCustomerEmailBlock(input: {
  customerId: string;
  matches: { id: string }[];
}): string | null {
  const other = input.matches.find((row) => row.id !== input.customerId);
  return other ? CUSTOMER_EMAIL_COPY.taken : null;
}
