import { formatDateFr, formatDateTimeFr } from "@/lib/crm/dates";
import { formatMoney } from "@/lib/crm/money";
import type { PayerKind } from "@/lib/crm/payer";

/**
 * Réservation d’un prélèvement SEPA vraiment lancé.
 * Ce n’est pas un encaissement : la ligne reste `pending` jusqu’au succès Stripe.
 * Un PaymentIntent `requires_payment_method` n’est pas un prélèvement.
 */

export const SEPA_PENDING_TITLE = "Prélèvement SEPA · en cours";
export const SEPA_BANK_DELAY = "Confirmation bancaire en général sous 6 jours ouvrés.";
export const SEPA_LOCK_PREFIX = "sepa-lock:";

const LAST4 = /^[A-Z0-9]{4}$/i;
const FAIL_PREFIX = /^\[sepa:(rib|retry)(?::([A-Z0-9]{4}))?\]\s*/i;

export type SepaPayer = PayerKind;

export type SepaIntentView = {
  id: string;
  status?: string | null;
  /** Centimes Stripe. */
  amount?: number | null;
  currency?: string | null;
  /** Secondes Unix. */
  created?: number | null;
  metadata?: Record<string, string> | null;
  paymentMethodTypes?: string[] | null;
  paymentMethodId?: string | null;
  chargeStatus?: string | null;
  chargeType?: string | null;
  chargeLast4?: string | null;
  failureCode?: string | null;
};

export type SepaFlight = {
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  payer: SepaPayer;
  companyId: string;
  last4: string | null;
  mention: string;
  launchedAt: string;
};

export type SepaReading =
  | { kind: "flight"; flight: SepaFlight }
  | { kind: "succeeded"; flight: SepaFlight }
  | { kind: "failed"; flight: SepaFlight; code: string; needsNewIban: boolean; message: string }
  | { kind: "canceled"; flight: SepaFlight }
  | { kind: "orphan" }
  | { kind: "ignore" };

export type SepaHoldView = {
  paymentIntentId: string;
  amount: number;
  currency: string;
  payer: SepaPayer;
  companyId: string | null;
  partLabel: string;
  last4: string | null;
  launchedAt: string;
};

export type SepaFailureView = {
  paymentIntentId: string | null;
  payer: SepaPayer;
  companyId: string | null;
  last4: string | null;
  needsNewIban: boolean;
  message: string;
  at: string;
};

type LedgerLike = {
  direction?: string | null;
  source?: string | null;
  status?: string | null;
  kind?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  label?: string | null;
  external_id?: string | null;
  payer_kind?: string | null;
  billing_company_id?: string | null;
  created_at?: string | null;
  occurred_on?: string | null;
};

export function roundSepaMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function sepaLast4(value: string | null | undefined) {
  const text = (value || "").trim();
  return LAST4.test(text) ? text.toUpperCase() : null;
}

export function isSepaLockId(externalId: string | null | undefined) {
  return (externalId || "").startsWith(SEPA_LOCK_PREFIX);
}

export function sepaLockId(customerId: string, payer: string, companyId: string) {
  return `${SEPA_LOCK_PREFIX}${customerId}:${payer}:${companyId || "-"}`;
}

function meta(intent: SepaIntentView) {
  return intent.metadata || {};
}

function isSepaMethod(intent: SepaIntentView) {
  const pay = (meta(intent).pay_method || "").trim();
  if (pay === "sepa_debit") return true;
  if ((intent.chargeType || "") === "sepa_debit") return true;
  const types = intent.paymentMethodTypes || [];
  return types.length > 0 && types.every((type) => type === "sepa_debit");
}

function payerOf(intent: SepaIntentView): SepaPayer | null {
  const marked = (meta(intent).payer_kind || "").trim();
  if (marked === "company" || marked === "personal") return marked;
  if ((meta(intent).billing_company_id || "").trim()) return "company";
  return null;
}

function flightOf(intent: SepaIntentView): SepaFlight | null {
  if (!intent.id || !isSepaMethod(intent)) return null;
  const payer = payerOf(intent);
  const cents = Number(intent.amount);
  if (!payer || !Number.isFinite(cents) || cents <= 0) return null;
  const created = Number(intent.created);
  const launchedAt = Number.isFinite(created) ? new Date(created * 1000).toISOString() : new Date(0).toISOString();
  return {
    paymentIntentId: intent.id,
    amountCents: Math.round(cents),
    currency: (intent.currency || "eur").toUpperCase(),
    payer,
    companyId: (meta(intent).billing_company_id || "").trim(),
    last4: sepaLast4(meta(intent).iban_last4) || sepaLast4(intent.chargeLast4),
    mention: (meta(intent).pay_mention || "").trim(),
    launchedAt,
  };
}

/** Lecture d’un PaymentIntent. `requires_payment_method` n’est jamais un débit en vol. */
export function readSepaIntent(intent: SepaIntentView): SepaReading {
  const status = (intent.status || "").trim();
  if (status === "requires_payment_method") {
    return isSepaMethod(intent) || !intent.paymentMethodId ? { kind: "orphan" } : { kind: "ignore" };
  }
  const flight = flightOf(intent);
  if (!flight) return { kind: "ignore" };
  if (status === "succeeded") return { kind: "succeeded", flight };
  if (status === "canceled") return { kind: "canceled", flight };
  if (status === "payment_failed" || (intent.chargeStatus || "") === "failed") {
    const code = (intent.failureCode || "payment_failed").slice(0, 80);
    const copy = sepaBankFailure(code);
    return { kind: "failed", flight, code, needsNewIban: copy.needsNewIban, message: copy.message };
  }
  const chargePending =
    (intent.chargeStatus || "") === "pending" &&
    ((intent.chargeType || "") === "sepa_debit" || meta(intent).pay_method === "sepa_debit");
  // Confirmé et envoyé à la banque. `requires_action` attend encore le client : pas une réservation.
  if (status === "processing" || (chargePending && status !== "requires_action" && status !== "requires_confirmation")) {
    return { kind: "flight", flight };
  }
  return { kind: "ignore" };
}

const NEW_IBAN_CODES = [
  "account_closed",
  "account_frozen",
  "bank_account_restricted",
  "bank_account_unusable",
  "bank_ownership_changed",
  "debit_not_authorized",
  "authorization_revoked",
  "debit_authorization_revoked",
  "mandate_invalid",
  "payment_method_invalid",
  "invalid_account_number",
  "incorrect_account_number",
  "no_account",
  "incorrect_account_holder_name",
];

const RETRY_CODES = ["insufficient_funds", "generic_could_not_process", "processing_error", "try_again_later"];

/**
 * Message français et suite. Fonds insuffisants : on peut réessayer.
 * Compte fermé, mandat révoqué, IBAN refusé : un nouveau RIB, pas le même mandat.
 */
export function sepaBankFailure(code: string): { needsNewIban: boolean; message: string } {
  const token = (code || "").toLowerCase();
  const retry =
    "Vous pouvez relancer le prélèvement, ou payer par carte ou par virement.";
  const newIban =
    "Enregistrez un nouveau RIB dans Facturation. Le même compte ne sera pas prélevé de nouveau. Vous pouvez aussi payer par carte ou par virement.";
  if (RETRY_CODES.some((item) => token.includes(item))) {
    const why = token.includes("insufficient")
      ? "La banque n’a pas pu débiter ce compte : les fonds sont insuffisants."
      : "La banque n’a pas pu traiter ce prélèvement.";
    return { needsNewIban: false, message: `${why} ${retry}` };
  }
  if (NEW_IBAN_CODES.some((item) => token.includes(item)) || /iban|mandate|revok|closed|unauthor/.test(token)) {
    const why = /closed|frozen|unusable/.test(token)
      ? "La banque indique que ce compte est fermé ou inutilisable."
      : /invalid_account|incorrect_account|no_account|iban/.test(token)
        ? "La banque refuse cet IBAN."
        : "Ce prélèvement n’est plus autorisé sur ce compte (mandat révoqué ou refus).";
    return { needsNewIban: true, message: `${why} ${newIban}` };
  }
  return {
    needsNewIban: false,
    message: `Le prélèvement n’a pas abouti. ${retry}`,
  };
}

export function sepaFailureLabel(input: { needsNewIban: boolean; last4: string | null; message: string }) {
  const last4 = sepaLast4(input.last4);
  const kind = input.needsNewIban ? "rib" : "retry";
  return `[sepa:${kind}${last4 ? `:${last4}` : ""}] ${input.message}`.replace(/\s+/g, " ").trim();
}

export function sepaFailureFromLabel(label: string | null | undefined, at = ""): Omit<SepaFailureView, "payer" | "companyId" | "paymentIntentId"> | null {
  const match = FAIL_PREFIX.exec(label || "");
  if (!match) return null;
  const message = (label || "").slice(match[0].length).trim();
  return {
    last4: sepaLast4(match[2]),
    needsNewIban: match[1].toLowerCase() === "rib",
    message,
    at,
  };
}

export function pendingSepaLabel(last4: string | null) {
  const safe = sepaLast4(last4);
  return safe ? `${SEPA_PENDING_TITLE} · compte ····${safe}` : SEPA_PENDING_TITLE;
}

export function pendingSepaTitle(label: string | null | undefined) {
  if ((label || "").startsWith(SEPA_PENDING_TITLE)) return SEPA_PENDING_TITLE;
  return (label || "").trim();
}

export function paidSepaLabel(when: string | null | undefined) {
  const date = formatDateFr(when || "");
  return date === "—" ? "Payé par prélèvement SEPA" : `Payé le ${date} par prélèvement SEPA`;
}

export function isPendingSepaRow(row: LedgerLike) {
  if (row.status !== "pending" || row.direction !== "credit" || row.source !== "stripe") return false;
  if (isSepaLockId(row.external_id)) return false;
  return (row.label || "").startsWith(SEPA_PENDING_TITLE);
}

export function sepaHoldsFromRows(
  rows: LedgerLike[],
  names?: Map<string, string | null>
): SepaHoldView[] {
  const holds: SepaHoldView[] = [];
  for (const row of rows) {
    if (!isPendingSepaRow(row)) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const payer: SepaPayer = row.payer_kind === "personal" ? "personal" : "company";
    const companyId = (row.billing_company_id || "").trim() || null;
    const name = companyId ? (names?.get(companyId) || "").trim() : "";
    const last4 = sepaLast4((row.label || "").match(/····([A-Z0-9]{4})/i)?.[1]);
    holds.push({
      paymentIntentId: (row.external_id || "").trim(),
      amount: roundSepaMoney(amount),
      currency: (row.currency || "EUR").toUpperCase(),
      payer,
      companyId,
      partLabel: payer === "personal" ? "Particulier" : name ? `Société · ${name}` : "Société",
      last4,
      launchedAt: row.created_at || (row.occurred_on ? `${row.occurred_on}T12:00:00.000Z` : new Date(0).toISOString()),
    });
  }
  return holds;
}

export function sepaFailuresFromRows(rows: LedgerLike[]): SepaFailureView[] {
  const found: SepaFailureView[] = [];
  for (const row of rows) {
    if (row.status !== "void" || row.source !== "stripe" || row.direction !== "credit") continue;
    const parsed = sepaFailureFromLabel(row.label, row.created_at || "");
    if (!parsed) continue;
    const payer: SepaPayer = row.payer_kind === "personal" ? "personal" : "company";
    found.push({
      ...parsed,
      paymentIntentId: (row.external_id || "").trim() || null,
      payer,
      companyId: (row.billing_company_id || "").trim() || null,
    });
  }
  found.sort((a, b) => (a.at < b.at ? 1 : -1));
  const latest = new Map<string, SepaFailureView>();
  for (const failure of found) {
    const key = `${failure.payer}:${failure.companyId || ""}`;
    if (!latest.has(key)) latest.set(key, failure);
  }
  return [...latest.values()];
}

/** Le solde affiché ne devient pas un avoir tant que la banque n’a pas confirmé. */
export function displayedEncours(posted: number, held: number) {
  const balance = roundSepaMoney(posted);
  const cover = roundSepaMoney(Math.max(0, held));
  if (balance >= 0 || cover <= 0) return balance;
  return Math.min(0, roundSepaMoney(balance + cover));
}

export function coverOwed<T extends { company: number; personal: number }>(
  owed: T,
  holds: { payer: SepaPayer; amount: number; currency?: string }[],
  currency = "EUR"
) {
  const same = holds.filter((hold) => !hold.currency || hold.currency.toUpperCase() === currency.toUpperCase());
  const companyHeld = same.filter((hold) => hold.payer === "company").reduce((sum, hold) => sum + hold.amount, 0);
  const personalHeld = same.filter((hold) => hold.payer === "personal").reduce((sum, hold) => sum + hold.amount, 0);
  const company = roundSepaMoney(Math.max(0, owed.company - companyHeld));
  const personal = roundSepaMoney(Math.max(0, owed.personal - personalHeld));
  return { ...owed, total: roundSepaMoney(company + personal), company, personal };
}

export function holdMatchesPart(
  hold: { payer: SepaPayer; companyId: string | null },
  payer: SepaPayer,
  companyId: string | null | undefined
) {
  if (hold.payer !== payer) return false;
  const left = (hold.companyId || "").trim();
  const right = (companyId || "").trim();
  if (!left || !right) return true;
  return left === right;
}

export function holdsForPart(holds: SepaHoldView[], payer: SepaPayer, companyId: string | null | undefined) {
  return holds.filter((hold) => holdMatchesPart(hold, payer, companyId));
}

export function sepaAlreadyBlocked(holds: SepaHoldView[], payer: SepaPayer, companyId: string | null | undefined) {
  return holdsForPart(holds, payer, companyId).length > 0;
}

/** Un second prélèvement de la même part est refusé, même si le montant a changé. */
export function sepaIntentBlocksPart(
  intent: SepaIntentView,
  expected: { customerId: string; payer: string; companyId: string }
) {
  const data = meta(intent);
  if ((data.crm_customer_id || "") !== expected.customerId) return false;
  if (!isSepaMethod(intent)) return false;
  const status = (intent.status || "").trim();
  const reading = readSepaIntent(intent);
  const open = reading.kind === "flight" || status === "requires_action";
  if (!open) return false;
  const payer: SepaPayer = expected.payer === "personal" ? "personal" : "company";
  const flightPayer = reading.kind === "flight" ? reading.flight.payer : payerOf(intent);
  if (flightPayer !== payer) return false;
  const companyId = reading.kind === "flight" ? reading.flight.companyId : (data.billing_company_id || "").trim();
  return holdMatchesPart({ payer, companyId: companyId || null }, payer, expected.companyId);
}

export function sameIbanBlocked(failure: SepaFailureView | null | undefined, last4: string | null) {
  if (!failure?.needsNewIban) return false;
  const current = sepaLast4(last4);
  const previous = sepaLast4(failure.last4);
  if (!current || !previous) return true;
  return current === previous;
}

/**
 * Annule les formulaires ouverts du même montant.
 * Ne renvoie jamais un PaymentIntent `processing`.
 */
export function orphanSepaIdsToCancel(intents: SepaIntentView[]) {
  const liveAmounts = new Set<number>();
  for (const intent of intents) {
    if (readSepaIntent(intent).kind !== "flight") continue;
    const amount = Number(intent.amount);
    if (Number.isFinite(amount) && amount > 0) liveAmounts.add(Math.round(amount));
  }
  const ids: string[] = [];
  for (const intent of intents) {
    const status = (intent.status || "").trim();
    if (status !== "requires_payment_method") continue;
    if (!intent.id || ids.includes(intent.id)) continue;
    const amount = Number(intent.amount);
    if (!Number.isFinite(amount) || !liveAmounts.has(Math.round(amount))) continue;
    ids.push(intent.id);
  }
  return ids;
}

export function sepaHoldSentence(amount: number, currency: string) {
  return `${formatMoney(amount, currency)} en cours de prélèvement SEPA`;
}

export function sepaBannerLine(hold: SepaHoldView) {
  const last4 = sepaLast4(hold.last4);
  const rib = last4 ? `RIB ••${last4}` : "RIB enregistré";
  const when = formatDateTimeFr(hold.launchedAt);
  return `${formatMoney(hold.amount, hold.currency)} · ${hold.partLabel} · ${rib} · lancé le ${when}. ${SEPA_BANK_DELAY}`;
}

export function sepaCoversMessage(amountLabel: string) {
  return `Un prélèvement SEPA de ${amountLabel} est déjà en cours. Carte et virement ne reprennent pas ce montant. Attendez la confirmation de la banque, en général sous 6 jours ouvrés.`;
}

export function sepaSurplusLock(amountLabel: string) {
  return `Un prélèvement de ${amountLabel} est déjà en cours sur cette part. Le bouton reste fermé jusqu’à la réponse de la banque. Le surplus, s’il y en a un, se règle par carte ou par virement.`;
}

export function sepaFailureAlert(input: { partLabel: string; amountLabel: string; last4: string | null; message: string }) {
  const last4 = sepaLast4(input.last4);
  const rib = last4 ? ` · compte ····${last4}` : "";
  return `Prélèvement refusé · ${input.partLabel} · ${input.amountLabel}${rib}. ${input.message}`.replace(/\s+/g, " ").trim().slice(0, 240);
}

export function eurosFromCents(cents: number) {
  return roundSepaMoney(Math.round(cents) / 100);
}

export type SepaLedgerPlan =
  | { action: "pending"; amount: number; label: string; occurredOn: string }
  | { action: "post"; amount: number; label: string; occurredOn: string }
  | { action: "void"; label: string }
  | { action: "keep" };

type ExistingLedger = { status?: string | null; external_id?: string | null } | null;

/** Décide l’écriture. Un crédit déjà posté ne redevient pas pending. Un PI non confirmé ne réserve rien. */
export function planSepaLedger(existing: ExistingLedger, reading: SepaReading, released: boolean): SepaLedgerPlan {
  if (released) return { action: "keep" };
  if (reading.kind === "ignore" || reading.kind === "orphan") return { action: "keep" };
  const amount = eurosFromCents(reading.flight.amountCents);
  const occurredOn = parisDay(reading.flight.launchedAt);
  if (reading.kind === "flight") {
    if (existing?.status === "posted" || existing?.status === "pending") return { action: "keep" };
    return { action: "pending", amount, label: pendingSepaLabel(reading.flight.last4), occurredOn };
  }
  if (reading.kind === "succeeded") {
    if (existing?.status === "posted") return { action: "keep" };
    const day = parisDay(new Date().toISOString());
    return { action: "post", amount, label: paidSepaLabel(day), occurredOn: day };
  }
  if (reading.kind === "failed") {
    if (existing?.status === "posted" || existing?.status === "void") return { action: "keep" };
    return {
      action: "void",
      label: sepaFailureLabel({
        needsNewIban: reading.needsNewIban,
        last4: reading.flight.last4,
        message: reading.message,
      }),
    };
  }
  if (reading.kind === "canceled") {
    if (existing?.status === "posted" || existing?.status === "void") return { action: "keep" };
    if (existing?.status === "pending") {
      return {
        action: "void",
        label: sepaFailureLabel({
          needsNewIban: false,
          last4: reading.flight.last4,
          message: "Ce prélèvement a été annulé avant l’encaissement. Vous pouvez le relancer, ou payer par carte ou par virement.",
        }),
      };
    }
  }
  return { action: "keep" };
}

function parisDay(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function disputeSepaAlert(input: { amountLabel: string; paymentIntentId: string; kind: "refund" | "dispute" }) {
  const what = input.kind === "dispute" ? "contesté" : "remboursé";
  return `Prélèvement SEPA ${what} · ${input.amountLabel} · ${input.paymentIntentId}. Ne pas rembourser une seconde fois : l’argent peut déjà être revenu. Vérifiez le relevé avant tout avoir.`.slice(0, 240);
}

export function mandateRevokedAlert(last4: string | null) {
  const rib = sepaLast4(last4);
  const account = rib ? ` (compte ····${rib})` : "";
  return `Mandat de prélèvement révoqué${account}. Les prochains prélèvements demanderont un nouveau RIB dans Facturation. Un prélèvement déjà envoyé à la banque continue.`.slice(0, 240);
}
