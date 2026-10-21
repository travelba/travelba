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

/**
 * Deux paiements : un contrôle de passerelle et le règlement.
 * `PLIANT_VIRTUAL` compte le contrôle. `PLIANT_SINGLE_USE` non, mais il n’autorise qu’un achat.
 * Une carte `TRAVEL` sans ce champ retombe à 3 (émission) ou 5 (émission avec porteur).
 */
export const DEFAULT_PLIANT_TRANSACTIONS = 2;

const PLIANT_TX_MAX = 999_999_999;

/** Contrôles vidés. L’API Pliant supprime un contrôle absent ou nul (`nullable`). */
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

function controlRecord(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const nested = row.cardControls;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested as Record<string, unknown>;
  return row;
}

/** Vrai quand aucun commerçant, catégorie, date, lieu, pays, devise ou mode n’est posé. */
export function pliantControlsAreOpen(payload: unknown) {
  const row = controlRecord(payload);
  if (!row) return false;
  return PLIANT_CONTROL_KEYS.every((key) => row[key] == null);
}

function issuedTransactionCount(value: unknown) {
  let text = "";
  if (typeof value === "number") text = String(value);
  else if (typeof value === "string") text = value.trim();
  if (!/^\d+$/.test(text)) return DEFAULT_PLIANT_TRANSACTIONS;
  const count = Number(text);
  if (!Number.isInteger(count) || count < 1 || count > PLIANT_TX_MAX) return DEFAULT_PLIANT_TRANSACTIONS;
  return count;
}

/**
 * Corps d’émission sans aucun blocage, même si l’appelant en avait posé.
 * Le plafond et le montant par transaction restent ceux de l’appelant.
 * Un nombre de transactions déjà choisi est gardé ; sinon 2.
 */
export function pliantIssuePayload(
  raw: Record<string, unknown>,
  resolved: { organizationId: string; cardConfig: string }
) {
  const rest = { ...raw };
  delete rest.cardControls;
  delete rest.additionalLimits;
  delete rest.type;
  return {
    ...rest,
    organizationId: resolved.organizationId,
    cardConfig: resolved.cardConfig,
    maxTransactionCount: issuedTransactionCount(raw.maxTransactionCount),
    cardControls: emptyPliantCardControls(),
  } as Record<string, unknown> & {
    organizationId: string;
    cardConfig: string;
    maxTransactionCount: number;
    cardControls: ReturnType<typeof emptyPliantCardControls>;
  };
}
