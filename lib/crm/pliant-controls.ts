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
