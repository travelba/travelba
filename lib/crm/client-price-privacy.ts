/**
 * Masquage des prix pour un client : l’espace client ne reçoit plus les montants.
 * L’agence continue de les voir. Défaut : tout est montré.
 */

const MONEY_KEYS = new Set([
  "amount",
  "amountLabel",
  "amountValue",
  "total",
  "total_amount",
  "balance",
  "balanceValue",
  "postedBalance",
  "held",
  "due",
  "owed",
  "remaining",
  "debits",
  "price",
  "priceLabel",
  "document_amount",
  "supplier_net",
  "supplier_net_eur",
  "public_price",
  "net",
  "margin",
  "commission",
  "clientSecret",
  "paymentUrl",
  "stripeUrl",
  "checkoutUrl",
]);

const STRIPE_PAY_HOST = /(?:buy|pay|checkout|invoice)\.stripe\.com/i;

export const CLIENT_MONEY_NOTICE = "Les montants et les transactions sont suivis par l’agence.";

export function clientHidesPrices(customer: { hide_client_prices?: boolean | null } | null | undefined) {
  return customer?.hide_client_prices === true;
}

/**
 * Titulaires dont l’option de prix s’applique encore.
 * Un jumeau suit seulement la fiche qui consulte.
 */
export function foreignPriceOwnerIds(viewerId: string, ownerIds: Iterable<string | null | undefined>, twinIds: Iterable<string>) {
  const twins = new Set(twinIds);
  const out: string[] = [];
  for (const id of ownerIds) {
    if (!id || id === viewerId || twins.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/** Le séjour est masqué si le client qui regarde, ou le titulaire du dossier, a l’option. */
export function stayHidesPrices(
  viewer: { hide_client_prices?: boolean | null } | null | undefined,
  ownerId: string | null | undefined,
  hiddenOwnerIds: ReadonlySet<string>
) {
  return clientHidesPrices(viewer) || Boolean(ownerId && hiddenOwnerIds.has(ownerId));
}

export function isClientMoneyFile(path: string) {
  const value = path.toLowerCase();
  if (value.includes("/mb3m/") || value.includes("/releves/") || value.includes("/factures/")) return true;
  const name = value.split("/").pop() || "";
  return /facture|proforma|pro-forma|invoice/.test(name);
}

export function isClientInvoiceDocument(doc: {
  kind?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
}) {
  const kind = (doc.kind || "").toLowerCase();
  if (kind === "invoice" || kind === "facture" || kind === "proforma") return true;
  return isClientMoneyFile(`${doc.file_name || ""} ${doc.storage_path || ""}`);
}

export function withoutClientInvoices<T extends { kind?: string | null; file_name?: string | null; storage_path?: string | null }>(
  docs: T[]
) {
  return docs.filter((doc) => !isClientInvoiceDocument(doc));
}

function isStripePayUrl(value: string) {
  return STRIPE_PAY_HOST.test(value);
}

/** Retire les clés de montant, à tous les niveaux. Le reste (titre, vol, pièce) reste. */
export function stripClientMoneyValue<T>(value: T, depth = 0): T {
  if (depth > 8 || value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripClientMoneyValue(item, depth + 1)) as T;
  }
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (MONEY_KEYS.has(key)) continue;
    if (typeof child === "string" && isStripePayUrl(child)) continue;
    out[key] = stripClientMoneyValue(child, depth + 1);
  }
  return out as T;
}

export function stripClientMoneyItem<T extends { amount?: unknown; details?: unknown }>(item: T): T {
  return stripClientMoneyValue(item);
}

/**
 * Forme renvoyée à l’espace client. Quand l’option est active, aucun montant,
 * aucun solde, aucun lien de paiement, et les factures sortent de la liste.
 */
export function clientFacingMoney<
  T extends {
    items?: { amount?: unknown; details?: unknown }[];
    documents?: { kind?: string | null; file_name?: string | null; storage_path?: string | null }[];
  },
>(payload: T, hide: boolean): T {
  if (!hide) return payload;
  const next = stripClientMoneyValue(payload);
  if (Array.isArray(next.documents)) {
    return { ...next, documents: withoutClientInvoices(next.documents) };
  }
  return next;
}
