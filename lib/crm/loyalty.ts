export const LOYALTY_PROGRAMS = [
  { key: "flying_blue", label: "Flying Blue", hint: "Air France / KLM" },
  { key: "miles_more", label: "Miles & More", hint: "Lufthansa / Swiss" },
  { key: "executive_club", label: "Executive Club", hint: "British Airways" },
  { key: "skywards", label: "Skywards", hint: "Emirates" },
  { key: "bonvoy", label: "Marriott Bonvoy", hint: "Hôtels Marriott" },
  { key: "all_accor", label: "ALL Accor", hint: "Accor Live Limitless" },
  { key: "grand_voyageur", label: "Grand Voyageur", hint: "SNCF" },
  { key: "great_members", label: "Great Members", hint: "Club Med" },
] as const;

export type LoyaltyKey = (typeof LOYALTY_PROGRAMS)[number]["key"];
export type LoyaltyMap = Partial<Record<LoyaltyKey, string | null>>;

export function normalizeLoyaltyNumber(value: unknown) {
  const raw = String(value || "").replace(/\s+/g, "").toUpperCase();
  return raw || null;
}

export function loyaltyFromCustomer(customer: {
  flying_blue?: string | null;
  loyalty?: LoyaltyMap | null;
}): LoyaltyMap {
  const stored = customer.loyalty && typeof customer.loyalty === "object" ? customer.loyalty : {};
  const next: LoyaltyMap = {};
  for (const program of LOYALTY_PROGRAMS) {
    const fromColumn = program.key === "flying_blue" ? customer.flying_blue : null;
    next[program.key] = fromColumn || stored[program.key] || null;
  }
  return next;
}

/** Libellés des programmes qui ont un numéro. */
export function filledLoyaltyLabels(loyalty: LoyaltyMap | null | undefined) {
  if (!loyalty || typeof loyalty !== "object") return [];
  return LOYALTY_PROGRAMS.filter((program) => normalizeLoyaltyNumber(loyalty[program.key])).map(
    (program) => program.label
  );
}

/** Colonne `loyalty` seulement si le corps l’envoie. */
export function loyaltyPatchFromBody(body: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(body, "loyalty")) return {};
  return { loyalty: normalizeLoyaltyMap(body.loyalty) };
}

export function normalizeLoyaltyMap(input: unknown): LoyaltyMap {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const next: LoyaltyMap = {};
  for (const program of LOYALTY_PROGRAMS) {
    next[program.key] = normalizeLoyaltyNumber(raw[program.key]);
  }
  return next;
}
