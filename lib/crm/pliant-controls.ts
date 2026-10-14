const PLIANT_CONTROL_KEYS = [
  "categories",
  "merchants",
  "dates",
  "times",
  "locations",
  "countries",
  "currencies",
  "acceptanceMethods",
] as const;

/** Contrôles vidés : Pliant supprime un contrôle absent ou nul. */
export function emptyPliantCardControls() {
  return {
    categories: null,
    merchants: null,
    dates: null,
    times: null,
    locations: null,
    countries: null,
    currencies: null,
    acceptanceMethods: null,
  };
}

/** Vrai quand aucun commerçant, catégorie, date, lieu, pays, devise ou mode n’est posé. */
export function pliantControlsAreOpen(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as Record<string, unknown>;
  return PLIANT_CONTROL_KEYS.every((key) => row[key] == null);
}

/** Corps d’émission sans aucun blocage, même si l’appelant en avait posé. */
export function pliantIssuePayload(
  raw: Record<string, unknown>,
  resolved: { organizationId: string; cardConfig: string }
) {
  const rest = { ...raw };
  delete rest.cardControls;
  return {
    ...rest,
    organizationId: resolved.organizationId,
    cardConfig: resolved.cardConfig,
    cardControls: emptyPliantCardControls(),
  } as Record<string, unknown> & {
    organizationId: string;
    cardConfig: string;
    cardControls: ReturnType<typeof emptyPliantCardControls>;
  };
}
