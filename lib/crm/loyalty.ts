export const LOYALTY_PROGRAMS = [
  { key: "flying_blue", label: "Flying Blue", hint: "Air France / KLM" },
  { key: "miles_more", label: "Miles & More", hint: "Lufthansa / Swiss" },
  { key: "executive_club", label: "Executive Club", hint: "British Airways" },
  { key: "skywards", label: "Skywards", hint: "Emirates" },
  { key: "bonvoy", label: "Marriott Bonvoy", hint: "Hôtels Marriott" },
  { key: "all_accor", label: "ALL Accor", hint: "Accor Live Limitless" },
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
  return {
    flying_blue: customer.flying_blue || stored.flying_blue || null,
    miles_more: stored.miles_more || null,
    executive_club: stored.executive_club || null,
    skywards: stored.skywards || null,
    bonvoy: stored.bonvoy || null,
    all_accor: stored.all_accor || null,
  };
}

export function normalizeLoyaltyMap(input: unknown): LoyaltyMap {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const next: LoyaltyMap = {};
  for (const program of LOYALTY_PROGRAMS) {
    next[program.key] = normalizeLoyaltyNumber(raw[program.key]);
  }
  return next;
}
