import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Mb3mError,
  mb3mFindCustomerPayments,
  mb3mPaymentAccount,
  mb3mPaymentReference,
  mb3mRealm,
  mb3mSavePayment,
  mb3mWriteMatching,
  type Mb3mRemotePayment,
} from "@/lib/crm/mb3m";
import { formatMoney } from "@/lib/crm/money";
import { mb3mPaymentUnchanged } from "@/lib/crm/sync-delta";

export type Mb3mCredit = {
  id: string;
  bookingId: string | null;
  customerId: string;
  billingCompanyId: string | null;
  amount: number;
  date: string;
  source: string;
  label: string;
};

export type Mb3mPaymentLink = {
  transactionId: string;
  paymentNumber: string;
  invoiceNumber: string | null;
  matchedAmount: number;
};

export type Mb3mPlannedPayment = {
  credit: Mb3mCredit;
  /** Montant lettré sur cette facture. */
  matched: number;
  /** Le crédit entier tient sur la facture : on peut poser booking_id. */
  attributeBooking: boolean;
  /** Règlement déjà présent dans MB3M : pas de second SavePayment. */
  existingNumber: string | null;
  /** Déjà lettré : on n’appelle pas WriteMatching. */
  alreadyMatched: boolean;
  /** Facture déjà lettrée, si ce n’est pas celle en cours. */
  lockedInvoice: string | null;
  /** Lecture MB3M impossible : on n’envoie pas de second règlement. */
  hold: string | null;
  /** Facture du lettrage. Vide : la facture CRM en cours. */
  targetInvoice: string | null;
  bank: string;
  mode: string;
  customModeId: number | null;
  reference: string;
  /** Rapprochement par le montant, sans lien CRM : à montrer, sans échec. */
  notice: string | null;
};

export type Mb3mReglement = {
  date: string;
  montant: number;
  numero_mb3m: string | null;
  statut: "envoye" | "deja_dans_mb3m" | "erreur";
  erreur?: string | null;
  avertissement?: string | null;
};

const CENT = 0.005;

const PAYMENT_GAP_PREFIX = "Aucun règlement à lettrer n’a été trouvé pour la facture n°";
const PAYMENT_SOURCE_PREFIX = "Rapproché par le montant : règlement n°";

/** Rien à pointer alors qu’il reste un montant dû. Visible, sans faire échouer la préparation. */
export function mb3mPaymentGapMessage(invoiceNumber: string, amount: number) {
  return `${PAYMENT_GAP_PREFIX} ${invoiceNumber.trim()} (${formatMoney(amount)} encore dus).`;
}

export function mb3mIsPaymentGap(message: string | null | undefined) {
  return (message || "").includes(PAYMENT_GAP_PREFIX);
}

export function withoutPaymentGap(warning: string | null | undefined) {
  return (warning || "")
    .replace(/Aucun règlement à lettrer n’a été trouvé pour la facture n° [^.]+\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Le règlement n’était pas identifié dans le CRM : on nomme la pièce et son dossier. */
export function mb3mPaymentSourceWarning(payment: Pick<Mb3mRemotePayment, "number" | "folderId" | "amount" | "unmatched">) {
  const folder = payment.folderId ? `dossier MB3M ${payment.folderId}` : "dossier MB3M non indiqué";
  return `${PAYMENT_SOURCE_PREFIX} ${payment.number} (${folder}, ${formatMoney(payment.amount)}, reste ${formatMoney(payment.unmatched)}).`;
}

export function matchMb3mRemotePayment(input: {
  credit: Mb3mCredit;
  remote: Mb3mRemotePayment[];
  known?: Mb3mPaymentLink;
  taken: Set<string>;
  reference: string;
  dossierFolderId: string | null;
}): { payment: Mb3mRemotePayment; identified: boolean } | null {
  const knownNumber = input.known?.paymentNumber?.trim();
  if (knownNumber) {
    const linked = input.remote.find((payment) => payment.number === knownNumber);
    return linked ? { payment: linked, identified: true } : null;
  }
  const byReference = input.remote.find((payment) => payment.reference.trim() === input.reference);
  if (byReference) return { payment: byReference, identified: true };
  const sameAmount = input.remote.filter(
    (payment) => !input.taken.has(payment.number) && sameMoney(payment.amount, input.credit.amount)
  );
  const open = sameAmount.filter((payment) => payment.unmatched > CENT);
  const pool = open.length
    ? open
    : sameAmount.filter((payment) => payment.date.slice(0, 10) === input.credit.date);
  if (!pool.length) return null;
  const folder = (input.dossierFolderId || "").trim();
  const inFolder = folder ? pool.filter((payment) => payment.folderId === folder) : [];
  const preferred = inFolder.length ? inFolder : pool;
  const dated = preferred.filter((payment) => payment.date.slice(0, 10) === input.credit.date);
  return { payment: dated[0] || preferred[0], identified: false };
}

export const MB3M_PAYMENT_LOOKUP_HOLD =
  "Les règlements déjà saisis chez MB3M n’ont pas pu être lus. Aucun envoi.";

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function sameMoney(left: number, right: number) {
  return Math.abs(left - right) < CENT;
}

/**
 * Crédits à envoyer sur cette facture.
 * Un crédit sans dossier n’est pris que s’il n’y a pas d’autre dossier ouvert,
 * et le lettrage ne dépasse pas le reste à payer. Le booking_id n’est posé
 * que si le crédit entier tient dans ce reste.
 */
export function planMb3mPayments(input: {
  bookingId: string;
  invoiceNumber: string;
  invoiceAmount: number;
  credits: Mb3mCredit[];
  otherOpenBookings: number;
  links: Mb3mPaymentLink[];
  remote: Mb3mRemotePayment[];
  /** Faux : FindPayments a échoué. On ne crée aucun règlement. */
  remoteReady: boolean;
  /** Dossier de la facture. Les règlements de ce dossier passent avant les autres. */
  folderId?: string | null;
}): Mb3mPlannedPayment[] {
  const linked = new Map(input.links.map((link) => [link.transactionId, link]));
  const taken = new Set(input.links.map((link) => link.paymentNumber));
  const invoiceNumber = input.invoiceNumber.trim();
  let remaining = cents(
    input.invoiceAmount -
      input.links.reduce(
        (sum, link) => (link.invoiceNumber?.trim() === invoiceNumber ? sum + link.matchedAmount : sum),
        0
      )
  );
  if (remaining < 0) remaining = 0;
  const plans: Mb3mPlannedPayment[] = [];
  const credits = [...input.credits].sort(
    (left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id)
  );
  for (const credit of credits) {
    const known = linked.get(credit.id);
    if (credit.bookingId && credit.bookingId !== input.bookingId) continue;
    if (remaining <= CENT) continue;
    const matched = cents(Math.min(credit.amount, remaining));
    if (matched <= CENT) continue;
    const reference = mb3mPaymentReference(credit.id);
    const account = mb3mPaymentAccount(credit.source, credit.label);
    const base = {
      credit,
      bank: account.bank,
      mode: account.mode,
      customModeId: account.customModeId,
      reference,
      notice: account.warning,
    };
    const hit = input.remoteReady
      ? matchMb3mRemotePayment({
          credit,
          remote: input.remote,
          known,
          taken,
          reference,
          dossierFolderId: input.folderId || null,
        })
      : null;
    if (known?.paymentNumber && input.remoteReady && !hit) {
      if (!(known.invoiceNumber || known.matchedAmount > CENT)) {
        plans.push({
          ...base,
          matched: 0,
          attributeBooking: false,
          existingNumber: known.paymentNumber,
          alreadyMatched: true,
          lockedInvoice: null,
          hold: null,
          targetInvoice: null,
          notice: [account.warning, `Le règlement MB3M n° ${known.paymentNumber} identifié pour ce crédit n’a pas été retrouvé.`]
            .filter(Boolean)
            .join(" "),
        });
      }
      continue;
    }
    const remote = hit?.payment || null;
    const notice = [account.warning, remote && hit && !hit.identified ? mb3mPaymentSourceWarning(remote) : null]
      .filter(Boolean)
      .join(" ") || null;
    const remoteLeft = Boolean(remote && remote.unmatched > CENT);
    const coveredHere = input.links
      .filter((link) => link.transactionId === credit.id && link.invoiceNumber?.trim() === invoiceNumber)
      .reduce((sum, link) => sum + link.matchedAmount, 0);
    if (remoteLeft && remote && coveredHere + CENT >= Math.min(remote.unmatched, remaining)) continue;
    if (!remoteLeft && (known?.invoiceNumber || (known && known.matchedAmount > CENT))) continue;
    if (!credit.bookingId && input.otherOpenBookings > 0 && !remote && !known?.paymentNumber) continue;
    if (!input.remoteReady && !known?.paymentNumber) {
      plans.push({
        ...base,
        matched,
        attributeBooking: false,
        existingNumber: null,
        alreadyMatched: false,
        lockedInvoice: null,
        hold: MB3M_PAYMENT_LOOKUP_HOLD,
        targetInvoice: null,
        notice: account.warning,
      });
      continue;
    }
    if (remote) {
      taken.add(remote.number);
      const cap = remote.unmatched == null ? (remote.invoiceNumber ? 0 : remote.amount) : remote.unmatched;
      if (cap <= CENT) {
        const here = remote.invoiceNumber?.trim() === invoiceNumber;
        plans.push({
          ...base,
          matched: here ? matched : 0,
          attributeBooking: false,
          existingNumber: remote.number,
          alreadyMatched: true,
          lockedInvoice: here ? null : remote.invoiceNumber,
          hold: null,
          targetInvoice: null,
          notice,
        });
        if (here) remaining = cents(remaining - matched);
        continue;
      }
      const use = cents(Math.min(matched, cap));
      plans.push({
        ...base,
        matched: use,
        attributeBooking:
          input.otherOpenBookings === 0 &&
          !credit.bookingId &&
          credit.amount <= remaining + CENT &&
          sameMoney(use, credit.amount),
        existingNumber: remote.number,
        alreadyMatched: false,
        lockedInvoice: null,
        hold: null,
        targetInvoice: null,
        notice,
      });
      remaining = cents(remaining - use);
      continue;
    }
    plans.push({
      ...base,
      matched,
      attributeBooking: !credit.bookingId && credit.amount <= remaining + CENT,
      existingNumber: known?.paymentNumber || null,
      alreadyMatched: false,
      lockedInvoice: null,
      hold: null,
      targetInvoice: null,
      notice: account.warning,
    });
    remaining = cents(remaining - matched);
  }
  return plans;
}

export async function applyMb3mPaymentPlans(
  input: {
    folderId: string;
    invoiceNumber: string;
    plans: Mb3mPlannedPayment[];
  },
  deps: {
    savePayment: (plan: Mb3mPlannedPayment) => Promise<{ number: string }>;
    writeMatching: (plan: Mb3mPlannedPayment, paymentNumber: string) => Promise<{ id: string }>;
    /** `settled` faux : numéro seulement, lettrage pas encore fait. */
    remember: (plan: Mb3mPlannedPayment, paymentNumber: string, matchingId: string, settled: boolean) => Promise<void>;
    attributeBooking: (transactionId: string) => Promise<void>;
  }
): Promise<Mb3mReglement[]> {
  const reglements: Mb3mReglement[] = [];
  const savedNumbers = new Map<string, string>();
  for (const plan of input.plans) {
    const base = { date: plan.credit.date, montant: plan.matched };
    if (plan.hold) {
      reglements.push({ ...base, numero_mb3m: null, statut: "erreur", erreur: plan.hold });
      continue;
    }
    try {
      let number = plan.existingNumber || savedNumbers.get(plan.credit.id) || null;
      const statut: Mb3mReglement["statut"] = number ? "deja_dans_mb3m" : "envoye";
      if (!number) {
        const saved = await deps.savePayment(plan);
        number = saved.number;
        await deps.remember(plan, number, "", false);
      }
      savedNumbers.set(plan.credit.id, number);
      if (!plan.alreadyMatched) {
        const matching = await deps.writeMatching(plan, number);
        await deps.remember(plan, number, matching.id, true);
      } else {
        await deps.remember(plan, number, "", true);
      }
      if (plan.matched <= CENT) {
        if (plan.notice) {
          reglements.push({ ...base, montant: 0, numero_mb3m: number, statut, avertissement: plan.notice });
        }
        continue;
      }
      if (plan.attributeBooking) await deps.attributeBooking(plan.credit.id);
      reglements.push({ ...base, numero_mb3m: number, statut, avertissement: plan.notice });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Le règlement MB3M n’a pas abouti.";
      reglements.push({ ...base, numero_mb3m: plan.existingNumber, statut: "erreur", erreur: message });
    }
  }
  return reglements;
}

export type Mb3mCreditRow = {
  id: string;
  booking_id: string | null;
  customer_id: string;
  billing_company_id: string | null;
  amount: number | string;
  occurred_on: string;
  source: string;
  label: string | null;
  status: string | null;
  direction: string;
  currency: string | null;
};

export type Mb3mCreditParty = {
  id: string;
  companyRole: "admin" | "member" | null;
  billingParentId: string | null;
};

/**
 * Clients dont les crédits peuvent payer ce dossier.
 * Le lien collaborateur → société est `billing_parent_id` (company_role member).
 * On prend le voyageur, le compte société, et les autres collaborateurs de cette société.
 */
export function mb3mCreditCustomerIds(input: {
  dossierCustomerId: string;
  billingCustomerId: string | null;
  parties: Mb3mCreditParty[];
}): string[] {
  const byId = new Map(input.parties.map((party) => [party.id, party]));
  const dossier = byId.get(input.dossierCustomerId);
  const companyId =
    (dossier?.companyRole === "member" && dossier.billingParentId) ||
    (dossier?.companyRole === "admin" ? dossier.id : null) ||
    input.billingCustomerId ||
    input.dossierCustomerId;
  const ids = new Set<string>([input.dossierCustomerId, companyId]);
  if (input.billingCustomerId) ids.add(input.billingCustomerId);
  for (const party of input.parties) {
    if (party.id === companyId) ids.add(party.id);
    if (party.companyRole === "member" && party.billingParentId === companyId) ids.add(party.id);
  }
  return [...ids];
}

/** Crédit du wallet : même société que le séjour, ou particulier si le séjour l’est. */
export function mb3mWalletCreditRows(billingCompanyId: string | null, rows: Mb3mCreditRow[]) {
  return rows.filter((row) => {
    if (!billingCompanyId) return !row.billing_company_id;
    return !row.billing_company_id || row.billing_company_id === billingCompanyId;
  });
}

function asCredit(row: Mb3mCreditRow): Mb3mCredit | null {
  if (row.direction !== "credit" || (row.status && row.status !== "posted")) return null;
  const currency = (row.currency || "EUR").toUpperCase();
  if (currency !== "EUR") return null;
  const amount = Number(row.amount);
  const date = (row.occurred_on || "").slice(0, 10);
  if (!Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    id: row.id,
    bookingId: row.booking_id,
    customerId: row.customer_id,
    billingCompanyId: row.billing_company_id,
    amount,
    date,
    source: row.source,
    label: row.label || "",
  };
}

export type Mb3mGdsInvoiceTarget = { number: string; amount: number };

/**
 * Après la facture CRM, le reste de chaque crédit se lettre sur les factures Amadeus,
 * dans l’ordre donné, sans second encaissement.
 */
export function planMb3mGdsMatchings(input: {
  bookingId: string;
  crmInvoiceNumber: string;
  credits: Mb3mCredit[];
  primary: Mb3mPlannedPayment[];
  links: Mb3mPaymentLink[];
  gdsInvoices: Mb3mGdsInvoiceTarget[];
  otherOpenBookings: number;
}): Mb3mPlannedPayment[] {
  const gdsNumbers = new Set(input.gdsInvoices.map((invoice) => invoice.number));
  const crmInvoice = input.crmInvoiceNumber.trim();
  const used = new Map<string, number>();
  const paymentNumber = new Map<string, string>();
  for (const link of input.links) {
    used.set(link.transactionId, cents((used.get(link.transactionId) || 0) + link.matchedAmount));
    if (link.paymentNumber) paymentNumber.set(link.transactionId, link.paymentNumber);
  }
  const blocked = new Set<string>();
  for (const plan of input.primary) {
    if (plan.hold || plan.lockedInvoice) blocked.add(plan.credit.id);
    if (!plan.hold && !plan.lockedInvoice) {
      used.set(plan.credit.id, cents((used.get(plan.credit.id) || 0) + plan.matched));
    }
    if (plan.existingNumber) paymentNumber.set(plan.credit.id, plan.existingNumber);
  }
  for (const link of input.links) {
    const invoice = link.invoiceNumber?.trim() || "";
    if (invoice && invoice !== crmInvoice && !gdsNumbers.has(invoice)) blocked.add(link.transactionId);
  }
  const plans: Mb3mPlannedPayment[] = [];
  const credits = [...input.credits].sort(
    (left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id)
  );
  for (const invoice of input.gdsInvoices) {
    let remaining = cents(
      invoice.amount -
        input.links.reduce(
          (sum, link) => (link.invoiceNumber?.trim() === invoice.number ? sum + link.matchedAmount : sum),
          0
        )
    );
    if (remaining < 0) remaining = 0;
    for (const credit of credits) {
      if (blocked.has(credit.id)) continue;
      if (credit.bookingId && credit.bookingId !== input.bookingId) continue;
      if (!credit.bookingId && input.otherOpenBookings > 0) continue;
      const remainder = cents(credit.amount - (used.get(credit.id) || 0));
      if (remainder <= CENT || remaining <= CENT) continue;
      const matched = cents(Math.min(remainder, remaining));
      const account = mb3mPaymentAccount(credit.source, credit.label);
      plans.push({
        credit,
        matched,
        attributeBooking: false,
        existingNumber: paymentNumber.get(credit.id) || null,
        alreadyMatched: false,
        lockedInvoice: null,
        hold: null,
        targetInvoice: invoice.number,
        bank: account.bank,
        mode: account.mode,
        customModeId: account.customModeId,
        reference: mb3mPaymentReference(credit.id),
        notice: account.warning,
      });
      used.set(credit.id, cents((used.get(credit.id) || 0) + matched));
      remaining = cents(remaining - matched);
    }
  }
  return plans;
}

export async function recordMb3mInvoicePayments(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    folderId: string;
    customerUid: string;
    invoiceNumber: string;
    invoiceAmount: number;
    gdsInvoices?: Mb3mGdsInvoiceTarget[];
  }
): Promise<Mb3mReglement[]> {
  const booking = await supabase
    .from("crm_bookings")
    .select("id, customer_id, billing_customer_id, billing_company_id, status")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (booking.error || !booking.data) return [];
  const stay = booking.data as {
    id: string;
    customer_id: string;
    billing_customer_id: string | null;
    billing_company_id: string | null;
    status: string | null;
  };
  const payerId = stay.billing_customer_id || stay.customer_id;
  const dossierCustomer = await supabase
    .from("crm_customers")
    .select("id, company_role, billing_parent_id")
    .eq("id", stay.customer_id)
    .maybeSingle();
  if (dossierCustomer.error) throw new Mb3mError("Les règlements du dossier n’ont pas pu être lus.", -1);
  const traveler = (dossierCustomer.data || null) as {
    id: string;
    company_role: "admin" | "member" | null;
    billing_parent_id: string | null;
  } | null;
  const companyId =
    (traveler?.company_role === "member" && traveler.billing_parent_id) ||
    (traveler?.company_role === "admin" ? traveler.id : null) ||
    payerId;
  const members = await supabase
    .from("crm_customers")
    .select("id, company_role, billing_parent_id")
    .eq("billing_parent_id", companyId)
    .eq("company_role", "member");
  if (members.error) throw new Mb3mError("Les règlements du dossier n’ont pas pu être lus.", -1);
  const creditCustomerIds = mb3mCreditCustomerIds({
    dossierCustomerId: stay.customer_id,
    billingCustomerId: payerId,
    parties: [
      ...(traveler
        ? [{ id: traveler.id, companyRole: traveler.company_role, billingParentId: traveler.billing_parent_id }]
        : []),
      { id: companyId, companyRole: companyId === traveler?.id ? traveler.company_role : "admin", billingParentId: null },
      ...((members.data || []) as { id: string; company_role: "admin" | "member" | null; billing_parent_id: string | null }[]).map(
        (row) => ({ id: row.id, companyRole: row.company_role, billingParentId: row.billing_parent_id })
      ),
    ],
  });
  const [direct, wallet, peers, links] = await Promise.all([
    supabase
      .from("crm_transactions")
      .select("id, booking_id, customer_id, billing_company_id, amount, occurred_on, source, label, status, direction, currency")
      .eq("booking_id", stay.id)
      .eq("direction", "credit")
      .eq("status", "posted"),
    supabase
      .from("crm_transactions")
      .select("id, booking_id, customer_id, billing_company_id, amount, occurred_on, source, label, status, direction, currency")
      .in("customer_id", creditCustomerIds)
      .is("booking_id", null)
      .eq("direction", "credit")
      .eq("status", "posted"),
    supabase
      .from("crm_bookings")
      .select("id, status, billing_company_id")
      .or(`customer_id.eq.${payerId},billing_customer_id.eq.${payerId}`)
      .neq("id", stay.id)
      .neq("status", "cancelled"),
    supabase
      .from("crm_mb3m_payments")
      .select(
        "id, transaction_id, booking_id, mb3m_payment_number, mb3m_invoice_number, mb3m_matching_id, amount, matched_amount"
      )
      .eq("realm", mb3mRealm()),
  ]);
  if (direct.error || wallet.error || peers.error || links.error) {
    throw new Mb3mError("Les règlements du dossier n’ont pas pu être lus.", -1);
  }
  const walletCredits = mb3mWalletCreditRows(stay.billing_company_id, (wallet.data || []) as Mb3mCreditRow[]);
  const credits = [...((direct.data || []) as Mb3mCreditRow[]), ...walletCredits].flatMap((row) => {
    const credit = asCredit(row);
    return credit ? [credit] : [];
  });
  const seen = new Set<string>();
  const unique = credits.filter((credit) => (seen.has(credit.id) ? false : (seen.add(credit.id), true)));
  let remote: Mb3mRemotePayment[] = [];
  const remoteReady = Boolean(input.customerUid.trim());
  const peerIds = ((peers.data || []) as { id: string }[]).map((row) => row.id);
  const folderScope = peerIds.length ? [stay.id, ...peerIds] : [stay.id];
  const folderRows = await supabase
    .from("crm_mb3m_pieces")
    .select("folder_id")
    .eq("realm", mb3mRealm())
    .in("booking_id", folderScope)
    .not("folder_id", "is", null);
  if (folderRows.error) throw new Mb3mError("Les dossiers MB3M du client n’ont pas pu être lus.", -1);
  const folderIds = [
    input.folderId,
    ...((folderRows.data || []) as { folder_id?: string | null }[]).map((row) => row.folder_id || ""),
  ];
  if (remoteReady) {
    try {
      remote = await mb3mFindCustomerPayments(input.customerUid, undefined, undefined, folderIds);
    } catch (err) {
      const message = err instanceof Error ? err.message : "lecture";
      throw new Mb3mError(`Les règlements MB3M n’ont pas pu être lus. ${message}`, -1);
    }
  } else if (unique.length) {
    throw new Mb3mError("Les règlements MB3M n’ont pas pu être lus. La fiche client n’est pas connue.", -1);
  }
  const stored = ((links.data || []) as {
    id?: string;
    transaction_id: string;
    booking_id?: string | null;
    mb3m_payment_number: string;
    mb3m_invoice_number: string | null;
    mb3m_matching_id?: string | null;
    amount?: number | string;
    matched_amount: number | string;
  }[]);
  const paymentIds = stored.flatMap((row) => (row.id ? [row.id] : []));
  const matchRows = paymentIds.length
    ? await supabase
        .from("crm_mb3m_payment_matches")
        .select("payment_id, mb3m_invoice_number, mb3m_matching_id, matched_amount")
        .in("payment_id", paymentIds)
    : { data: [], error: null };
  if (matchRows.error) throw new Mb3mError("Les règlements du dossier n’ont pas pu être lus.", -1);
  const transactionByPayment = new Map(stored.flatMap((row) => (row.id ? [[row.id, row.transaction_id] as const] : [])));
  const linkRows: Mb3mPaymentLink[] = [
    ...stored.map((row) => ({
      transactionId: row.transaction_id,
      paymentNumber: row.mb3m_payment_number,
      invoiceNumber: row.mb3m_invoice_number,
      matchedAmount: Number(row.matched_amount) || 0,
    })),
    ...((matchRows.data || []) as { payment_id: string; mb3m_invoice_number: string; matched_amount: number | string }[]).flatMap(
      (row) => {
        const transactionId = transactionByPayment.get(row.payment_id);
        if (!transactionId) return [];
        return [
          {
            transactionId,
            paymentNumber: stored.find((payment) => payment.id === row.payment_id)?.mb3m_payment_number || "",
            invoiceNumber: row.mb3m_invoice_number,
            matchedAmount: Number(row.matched_amount) || 0,
          },
        ];
      }
    ),
  ];
  const plans = planMb3mPayments({
    bookingId: stay.id,
    invoiceNumber: input.invoiceNumber,
    invoiceAmount: input.invoiceAmount,
    credits: unique,
    otherOpenBookings: ((peers.data || []) as { id: string }[]).length,
    links: linkRows,
    remote,
    remoteReady,
    folderId: input.folderId,
  });
  const gdsPlans = planMb3mGdsMatchings({
    bookingId: stay.id,
    crmInvoiceNumber: input.invoiceNumber,
    credits: unique,
    primary: plans,
    links: linkRows,
    gdsInvoices: input.gdsInvoices || [],
    otherOpenBookings: ((peers.data || []) as { id: string }[]).length,
  });
  const reglements = await applyMb3mPaymentPlans(
    { folderId: input.folderId, invoiceNumber: input.invoiceNumber, plans: [...plans, ...gdsPlans] },
    {
      savePayment: (plan) =>
        mb3mSavePayment({
          folderId: input.folderId,
          amount: plan.credit.amount,
          date: plan.credit.date,
          reference: plan.reference,
          bank: plan.bank,
          mode: plan.mode,
          customModeId: plan.customModeId,
        }),
      writeMatching: (plan, paymentNumber) =>
        mb3mWriteMatching({
          paymentNumber,
          invoiceNumber: plan.targetInvoice || input.invoiceNumber,
          amount: plan.matched,
        }),
      remember: async (plan, paymentNumber, matchingId, settled) => {
        const realm = mb3mRealm();
        const target = plan.targetInvoice || input.invoiceNumber;
        if (plan.targetInvoice && plan.targetInvoice !== input.invoiceNumber) {
          const payment = await supabase
            .from("crm_mb3m_payments")
            .select("id")
            .eq("transaction_id", plan.credit.id)
            .eq("realm", realm)
            .maybeSingle();
          const paymentId = (payment.data as { id?: string } | null)?.id;
          if (payment.error || !paymentId) throw new Mb3mError("Le règlement n’a pas pu être enregistré.", -1);
          const known = ((matchRows.data || []) as {
            payment_id?: string;
            mb3m_invoice_number?: string | null;
            mb3m_matching_id?: string | null;
            matched_amount?: number | string;
          }[]).find(
            (item) => item.payment_id === paymentId && item.mb3m_invoice_number === plan.targetInvoice
          );
          if (
            known &&
            mb3mPaymentUnchanged(
              {
                mb3m_invoice_number: known.mb3m_invoice_number,
                mb3m_matching_id: known.mb3m_matching_id,
                matched_amount: known.matched_amount,
              },
              {
                mb3m_invoice_number: plan.targetInvoice,
                mb3m_matching_id: matchingId || null,
                matched_amount: plan.matched,
              }
            )
          ) {
            return;
          }
          const { error } = await supabase.from("crm_mb3m_payment_matches").upsert(
            {
              payment_id: paymentId,
              mb3m_invoice_number: plan.targetInvoice,
              mb3m_matching_id: matchingId || null,
              matched_amount: plan.matched,
            },
            { onConflict: "payment_id,mb3m_invoice_number" }
          );
          if (error) throw new Mb3mError("Le règlement n’a pas pu être enregistré.", -1);
          return;
        }
        const row = {
          transaction_id: plan.credit.id,
          booking_id: plan.lockedInvoice ? null : stay.id,
          realm,
          mb3m_payment_number: paymentNumber,
          mb3m_invoice_number: settled ? plan.lockedInvoice || target : null,
          mb3m_matching_id: settled && matchingId ? matchingId : null,
          amount: plan.credit.amount,
          matched_amount: settled ? plan.matched : 0,
        };
        const previous = stored.find((item) => item.transaction_id === plan.credit.id);
        if (previous && mb3mPaymentUnchanged(previous, row)) return;
        const { error } = await supabase.from("crm_mb3m_payments").upsert(row, { onConflict: "transaction_id,realm" });
        if (error) throw new Mb3mError("Le règlement n’a pas pu être enregistré.", -1);
      },
      attributeBooking: async (transactionId) => {
        await supabase.from("crm_transactions").update({ booking_id: stay.id }).eq("id", transactionId).is("booking_id", null);
      },
    }
  );
  const already = cents(
    linkRows
      .filter((link) => link.invoiceNumber?.trim() === input.invoiceNumber.trim())
      .reduce((sum, link) => sum + (Number(link.matchedAmount) || 0), 0)
  );
  const due = cents(Math.max(0, input.invoiceAmount - already));
  const lettered = reglements.some((row) => row.statut !== "erreur" && row.montant > CENT);
  const notes = reglements.flatMap((row) => (row.avertissement ? [row.avertissement] : []));
  if (due > CENT && !lettered) {
    const erreur = mb3mPaymentGapMessage(input.invoiceNumber, due);
    reglements.push({ date: "", montant: due, numero_mb3m: null, statut: "erreur", erreur });
    await rememberPaymentNotes(supabase, input.bookingId, input.invoiceNumber, erreur, notes);
  } else {
    await rememberPaymentNotes(supabase, input.bookingId, input.invoiceNumber, null, notes);
  }
  const failed = reglements.find((row) => row.statut === "erreur" && !mb3mIsPaymentGap(row.erreur));
  if (failed) throw new Mb3mError(failed.erreur || "Les règlements n’ont pas pu être enregistrés.", -1);
  return reglements;
}

async function rememberPaymentNotes(
  supabase: SupabaseClient,
  bookingId: string,
  invoiceNumber: string,
  gap: string | null,
  notes: string[]
) {
  const found = await supabase
    .from("crm_mb3m_pieces")
    .select("id, warning")
    .eq("booking_id", bookingId)
    .eq("kind", "invoice")
    .eq("realm", mb3mRealm())
    .eq("piece_number", invoiceNumber.trim())
    .maybeSingle();
  if (found.error || !found.data) return;
  const row = found.data as { id: string; warning?: string | null };
  const base = withoutPaymentGap(row.warning);
  const extras = [...(gap ? [gap] : []), ...notes].filter((note) => note && !base.includes(note));
  const next = [base, ...extras].filter(Boolean).join(" ");
  if (next === (row.warning || "").replace(/\s+/g, " ").trim()) return;
  const saved = await supabase
    .from("crm_mb3m_pieces")
    .update({ warning: next || null, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (saved.error) console.error("[mb3m] avertissement règlement", saved.error.message);
}
