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
  reference: string;
};

export type Mb3mReglement = {
  date: string;
  montant: number;
  numero_mb3m: string | null;
  statut: "envoye" | "deja_dans_mb3m" | "erreur";
  erreur?: string | null;
};

const CENT = 0.005;

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
    if (known?.invoiceNumber || (known && known.matchedAmount > 0)) continue;
    if (credit.bookingId && credit.bookingId !== input.bookingId) continue;
    if (!credit.bookingId && input.otherOpenBookings > 0) continue;
    if (remaining <= CENT) continue;
    const matched = cents(Math.min(credit.amount, remaining));
    if (matched <= CENT) continue;
    const reference = mb3mPaymentReference(credit.id);
    const account = mb3mPaymentAccount(credit.source, credit.label);
    const base = { credit, bank: account.bank, mode: account.mode, reference };
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
      });
      continue;
    }
    const remote = input.remoteReady
      ? input.remote.find((payment) => payment.reference.trim() === reference) ||
        input.remote.find(
          (payment) =>
            !taken.has(payment.number) &&
            payment.date.slice(0, 10) === credit.date &&
            sameMoney(payment.amount, credit.amount)
        ) ||
        null
      : null;
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
        });
        if (here) remaining = cents(remaining - matched);
        continue;
      }
      const use = cents(Math.min(matched, cap));
      plans.push({
        ...base,
        matched: use,
        attributeBooking: !credit.bookingId && credit.amount <= remaining + CENT && sameMoney(use, credit.amount),
        existingNumber: remote.number,
        alreadyMatched: false,
        lockedInvoice: null,
        hold: null,
        targetInvoice: null,
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
      if (plan.matched <= CENT) continue;
      if (plan.attributeBooking) await deps.attributeBooking(plan.credit.id);
      reglements.push({ ...base, numero_mb3m: number, statut });
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
        reference: mb3mPaymentReference(credit.id),
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
      .eq("customer_id", payerId)
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
      .select("id, transaction_id, mb3m_payment_number, mb3m_invoice_number, matched_amount")
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
  let remoteReady = Boolean(input.customerUid.trim());
  if (remoteReady) {
    try {
      remote = await mb3mFindCustomerPayments(input.customerUid);
    } catch (err) {
      console.error("[mb3m] lecture des règlements", err instanceof Error ? err.message : err);
      remote = [];
      remoteReady = false;
    }
  }
  const stored = ((links.data || []) as {
    id?: string;
    transaction_id: string;
    mb3m_payment_number: string;
    mb3m_invoice_number: string | null;
    matched_amount: number | string;
  }[]);
  const paymentIds = stored.flatMap((row) => (row.id ? [row.id] : []));
  const matchRows = paymentIds.length
    ? await supabase
        .from("crm_mb3m_payment_matches")
        .select("payment_id, mb3m_invoice_number, matched_amount")
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
  return applyMb3mPaymentPlans(
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
        const { error } = await supabase.from("crm_mb3m_payments").upsert(row, { onConflict: "transaction_id,realm" });
        if (error) throw new Mb3mError("Le règlement n’a pas pu être enregistré.", -1);
      },
      attributeBooking: async (transactionId) => {
        await supabase.from("crm_transactions").update({ booking_id: stay.id }).eq("id", transactionId).is("booking_id", null);
      },
    }
  );
}
