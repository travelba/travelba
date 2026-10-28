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
 * Pas une config `TRAVEL` : son défaut est 3 ou 5, et Commercial Choice refuse des commerçants.
 */
export const PLIANT_VIRTUAL = "PLIANT_VIRTUAL";

/**
 * Deux paiements sur une carte virtuelle de formalité : un contrôle de passerelle et le règlement.
 * Les cartes fournisseur et le formulaire du dossier restent à usage unique et n’envoient pas ce nombre.
 * `creer_carte_pliant` envoie le nombre seulement quand il est supérieur à 1, sur `PLIANT_VIRTUAL`.
 */
export const DEFAULT_PLIANT_TRANSACTIONS = 2;

const PLIANT_TX_MAX = 999_999_999;

export function pliantConfigIsSingleUse(cardConfig: string) {
  return /SINGLE_USE$/i.test(cardConfig.trim());
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
 * 1 achat : `PLIANT_SINGLE_USE`, sans `maxTransactionCount` (la règle du produit).
 * Davantage : `PLIANT_VIRTUAL`, qui honore le nombre. Jamais une config `TRAVEL`.
 */
export function pliantCardForTransactionCount(count: number) {
  if (count <= 1) return { cardConfig: PLIANT_SINGLE_USE, maxTransactionCount: null as number | null };
  return { cardConfig: PLIANT_VIRTUAL, maxTransactionCount: count };
}

/** `purpose` est obligatoire pour une config qui se termine par SINGLE_USE (200 caractères). */
function issuedPurpose(raw: Record<string, unknown>, cardConfig: string) {
  const current = typeof raw.purpose === "string" ? raw.purpose.trim() : "";
  if (current) return current.slice(0, 200);
  if (!pliantConfigIsSingleUse(cardConfig)) return "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  return label.slice(0, 200);
}

/**
 * Corps d’émission sans aucun blocage, même si l’appelant en avait posé.
 * Le plafond, le montant par transaction et la fenêtre restent ceux de l’appelant.
 * Une carte à usage unique n’envoie pas `maxTransactionCount` : le champ est un plafond
 * d’autorisations (1 à 999999999), sans défaut propre à SINGLE_USE. Le seul défaut
 * documenté est celui des cartes TRAVEL (3 à l’émission, 5 avec le porteur). L’usage
 * unique est la règle du produit, et un contrôle de passerelle ne consomme pas l’achat.
 */
export function pliantIssuePayload(
  raw: Record<string, unknown>,
  resolved: { organizationId: string; cardConfig: string }
) {
  const rest = { ...raw };
  delete rest.cardControls;
  delete rest.additionalLimits;
  delete rest.type;
  delete rest.maxTransactionCount;
  delete rest.purpose;
  const purpose = issuedPurpose(raw, resolved.cardConfig);
  const count = pliantConfigIsSingleUse(resolved.cardConfig) ? null : explicitTransactionCount(raw.maxTransactionCount);
  return {
    ...rest,
    organizationId: resolved.organizationId,
    cardConfig: resolved.cardConfig,
    ...(purpose ? { purpose } : {}),
    ...(count != null ? { maxTransactionCount: count } : {}),
    cardControls: emptyPliantCardControls(),
  } as Record<string, unknown> & {
    organizationId: string;
    cardConfig: string;
    purpose?: string;
    maxTransactionCount?: number;
    cardControls: ReturnType<typeof emptyPliantCardControls>;
  };
}
