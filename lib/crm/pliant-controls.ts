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
 * Produit Pliant à un seul achat. Les contrôles de carte ne comptent pas.
 * Même acceptation que `PLIANT_VIRTUAL` : une devise étrangère passe, jusqu’au plafond en euros.
 */
export const PLIANT_SINGLE_USE = "PLIANT_SINGLE_USE";

/**
 * Carte virtuelle réutilisable. `maxTransactionCount` est honoré (1 à 999999999).
 * Sans ce champ, Pliant laisse un nombre d’achats illimité jusqu’à l’expiration.
 * Repli si les cartes voyage ne sont pas activées.
 */
export const PLIANT_VIRTUAL = "PLIANT_VIRTUAL";

/**
 * Carte voyage, exemptée de 3DS. Uniquement si elle est émissible sur le compte.
 * Jamais une variante Commercial Choice (`_CC`) : elle refuse des commerçants.
 * Sans `maxTransactionCount`, Pliant pose 3 ou 5 achats : le nombre est toujours envoyé.
 */
export const PLIANT_VIRTUAL_TRAVEL = "PLIANT_VIRTUAL_TRAVEL";

/** Repli lisible quand le compte n’a pas les cartes voyage. */
export const PLIANT_TRAVEL_WARNING = "Cartes voyage non activées sur le compte Pliant : 3DS possible.";

/**
 * Deux paiements sur une carte de formalité : un contrôle de passerelle et le règlement.
 * L’émission préfère `PLIANT_VIRTUAL_TRAVEL` et envoie ce nombre explicitement.
 */
export const DEFAULT_PLIANT_TRANSACTIONS = 2;

const PLIANT_TX_MAX = 999_999_999;

export function pliantConfigIsSingleUse(cardConfig: string) {
  return /SINGLE_USE$/i.test(cardConfig.trim());
}

/** Exactement la carte voyage, pas une Commercial Choice. */
export function pliantConfigIsTravel(cardConfig: string) {
  return cardConfig.trim() === PLIANT_VIRTUAL_TRAVEL;
}

/** `PLIANT_VIRTUAL_TRAVEL_CC` et `PLIANT_VIRTUAL_TRAVEL_CC_150` : jamais émises. */
export function pliantConfigIsCommercialChoice(cardConfig: string) {
  return /_CC(?:_|$)/i.test(cardConfig.trim());
}

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

function explicitTransactionCount(value: unknown) {
  let text = "";
  if (typeof value === "number" && Number.isFinite(value)) text = String(Math.trunc(value));
  else if (typeof value === "string") text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  if (!Number.isInteger(count) || count < 1 || count > PLIANT_TX_MAX) return null;
  return count;
}

/**
 * Nombre d’achats demandé pour `creer_carte_pliant`.
 * Absent ou vide : 1, qui reste une carte à usage unique.
 * Un entier de 1 à 999999999 est accepté. Une décimale ou un texte ne l’est pas.
 */
export function parsePliantTransactionCount(value: unknown): { ok: true; count: number } | { ok: false } {
  if (value == null || value === "") return { ok: true, count: 1 };
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > PLIANT_TX_MAX) return { ok: false };
    return { ok: true, count: value };
  }
  if (typeof value !== "string") return { ok: false };
  const text = value.trim();
  if (!text) return { ok: true, count: 1 };
  if (!/^\d+$/.test(text)) return { ok: false };
  const count = Number(text);
  if (!Number.isInteger(count) || count < 1 || count > PLIANT_TX_MAX) return { ok: false };
  return { ok: true, count };
}

/**
 * Produit de repli si `PLIANT_VIRTUAL_TRAVEL` n’est pas émissible.
 * 1 achat : `PLIANT_SINGLE_USE`, sans envoyer `maxTransactionCount`.
 * Davantage : `PLIANT_VIRTUAL`, qui honore le nombre.
 * `transactions` est le nombre que la carte voyage envoie toujours (1 par défaut).
 */
export function pliantCardForTransactionCount(count: number) {
  const transactions = Number.isInteger(count) && count >= 1 ? count : 1;
  if (transactions <= 1) {
    return { cardConfig: PLIANT_SINGLE_USE, maxTransactionCount: null as number | null, transactions: 1 };
  }
  return { cardConfig: PLIANT_VIRTUAL, maxTransactionCount: transactions, transactions };
}

/** `purpose` est obligatoire pour une config qui se termine par SINGLE_USE (200 caractères). */
function issuedPurpose(raw: Record<string, unknown>, cardConfig: string) {
  const current = typeof raw.purpose === "string" ? raw.purpose.trim() : "";
  if (current) return current.slice(0, 200);
  if (!pliantConfigIsSingleUse(cardConfig)) return "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  return label.slice(0, 200);
}

function moneyCopy(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as { value?: unknown; currency?: unknown };
  const amount = typeof row.value === "number" ? row.value : Number(row.value);
  if (!Number.isFinite(amount)) return null;
  const currency = typeof row.currency === "string" && row.currency.trim() ? row.currency.trim().toUpperCase() : "EUR";
  return { value: amount, currency };
}

/**
 * Corps d’émission sans aucun blocage, même si l’appelant en avait posé.
 * Carte voyage : `maxTransactionCount` est toujours là (1 si le nombre manque),
 * le renouvellement est `TOTAL`, et le montant d’un achat égale le plafond.
 * Repli à usage unique : le nombre n’est pas envoyé. Une carte virtuelle de repli
 * garde le nombre saisi. Une config `_CC` est refusée.
 */
export function pliantIssuePayload(
  raw: Record<string, unknown>,
  resolved: { organizationId: string; cardConfig: string }
) {
  if (pliantConfigIsCommercialChoice(resolved.cardConfig)) {
    throw new Error("Pliant : une configuration Commercial Choice n’est pas utilisée.");
  }
  const rest = { ...raw };
  delete rest.cardControls;
  delete rest.additionalLimits;
  delete rest.type;
  delete rest.maxTransactionCount;
  delete rest.purpose;
  const travel = pliantConfigIsTravel(resolved.cardConfig);
  const purpose = issuedPurpose(raw, resolved.cardConfig);
  const requested = explicitTransactionCount(raw.maxTransactionCount);
  const count = travel ? (requested ?? 1) : pliantConfigIsSingleUse(resolved.cardConfig) ? null : requested;
  const limit = moneyCopy(rest.limit);
  return {
    ...rest,
    organizationId: resolved.organizationId,
    cardConfig: resolved.cardConfig,
    ...(purpose ? { purpose } : {}),
    ...(count != null ? { maxTransactionCount: count } : {}),
    ...(travel ? { limitRenewFrequency: "TOTAL" as const } : {}),
    ...(travel && limit ? { limit, transactionLimit: limit } : {}),
    cardControls: emptyPliantCardControls(),
  } as Record<string, unknown> & {
    organizationId: string;
    cardConfig: string;
    purpose?: string;
    maxTransactionCount?: number;
    limitRenewFrequency?: "TOTAL";
    cardControls: ReturnType<typeof emptyPliantCardControls>;
  };
}
