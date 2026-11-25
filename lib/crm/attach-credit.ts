import { fold } from "@/lib/crm/text";
import type { PayerKind } from "@/lib/crm/payer";
import { payerKindOf } from "@/lib/crm/payer";

/** Crédit déjà encaissé, sans dossier et sans payeur. */
export function isLooseCredit(row: {
  direction?: string | null;
  status?: string | null;
  booking_id?: string | null;
  payer_kind?: string | null;
  billing_company_id?: string | null;
}) {
  if (row.direction !== "credit") return false;
  if (row.status !== "posted") return false;
  if (row.booking_id) return false;
  if (row.payer_kind === "company" || row.payer_kind === "personal") return false;
  if (row.billing_company_id) return false;
  return true;
}

export type CreditBookingHint = {
  id: string;
  reference: string;
  payer_kind?: string | null;
  billing_company_id?: string | null;
  status?: string | null;
  archived_at?: string | null;
};

export type CreditCompanyHint = {
  id: string;
  company_name?: string | null;
};

export type CreditLink = {
  bookingId: string | null;
  payerKind: PayerKind | null;
  companyId: string | null;
  reason: string | null;
};

const DOSSIER_REF = /\b(TB-\d{4}-\d{3,})\b/gi;
const NAME_STOP = new Set(["societe", "société", "sarl", "sas", "eurl", "sa", "sasu", "sci"]);

function containsName(label: string, name: string) {
  const foldedLabel = fold(label);
  const foldedName = fold(name).trim();
  if (foldedName.length < 3) return false;
  const escaped = foldedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(foldedLabel);
}

function nameScore(label: string, name: string) {
  const trimmed = (name || "").trim();
  if (trimmed.length < 3) return 0;
  if (containsName(label, trimmed)) return trimmed.length;
  const words = fold(trimmed)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !NAME_STOP.has(word));
  if (!words.length) return 0;
  if (!words.every((word) => containsName(label, word))) return 0;
  return Math.max(...words.map((word) => word.length));
}

function payerFromBooking(booking: CreditBookingHint): { payerKind: PayerKind | null; companyId: string | null } {
  if (booking.payer_kind === "personal") return { payerKind: "personal", companyId: null };
  if (booking.payer_kind === "company" || booking.billing_company_id) {
    return { payerKind: "company", companyId: booking.billing_company_id || null };
  }
  return { payerKind: null, companyId: null };
}

/**
 * Proposition seulement. Une référence de dossier désigne ce dossier.
 * Un nom de société désigne ce payeur. Rien n’est écrit.
 */
export function suggestCreditLink(input: {
  label: string;
  bookings: CreditBookingHint[];
  companies: CreditCompanyHint[];
}): CreditLink {
  const empty: CreditLink = { bookingId: null, payerKind: null, companyId: null, reason: null };
  const label = input.label || "";
  const refs = [...label.matchAll(DOSSIER_REF)].map((match) => match[1].toUpperCase());
  const uniqueRefs = [...new Set(refs)];
  const byRef =
    uniqueRefs.length === 1
      ? input.bookings.filter((booking) => (booking.reference || "").toUpperCase() === uniqueRefs[0])
      : [];
  const scored = input.companies
    .map((company) => ({ company, score: nameScore(label, company.company_name || "") }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const company =
    best && !scored.some((row) => row.company.id !== best.company.id && row.score === best.score)
      ? best.company
      : null;

  if (byRef.length === 1) {
    const booking = byRef[0];
    const fromBooking = payerFromBooking(booking);
    const payerKind = fromBooking.payerKind || (company ? "company" : null);
    const companyId =
      payerKind === "personal" ? null : fromBooking.companyId || (payerKind === "company" ? company?.id || null : null);
    return {
      bookingId: booking.id,
      payerKind,
      companyId,
      reason: "Référence du dossier",
    };
  }

  if (!company) return empty;
  const onCompany = input.bookings.filter(
    (booking) =>
      !booking.archived_at &&
      booking.status !== "cancelled" &&
      booking.billing_company_id === company.id
  );
  return {
    bookingId: onCompany.length === 1 ? onCompany[0].id : null,
    payerKind: "company",
    companyId: company.id,
    reason: "Nom de la société",
  };
}

const PAYER_WORDS: Record<string, PayerKind> = {
  personal: "personal",
  particulier: "personal",
  company: "company",
  societe: "company",
  société: "company",
};

export function payerKindFromInput(value: unknown): PayerKind | null {
  if (typeof value !== "string") return payerKindOf(value);
  const key = fold(value).trim();
  return PAYER_WORDS[key] || payerKindOf(value);
}

/** Chaîne minimale. `any` évite l’instanciation infinie du client Supabase. */
type LinkAdmin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export type AttachCreditInput = {
  id: string;
  bookingId: string;
  payerKind: PayerKind;
  companyId: string | null;
};

export type AttachCreditResult =
  | {
      ok: true;
      deja: boolean;
      mouvement_id: string;
      client_id: string;
      montant: number;
      devise: string;
      dossier_id: string;
      reference: string;
      payeur: PayerKind;
      societe_id: string | null;
    }
  | { ok: false; error: string };

/**
 * Rattache un crédit déjà encaissé. Ne crée pas de paiement et ne change pas le montant.
 */
export async function attachPostedCredit(admin: LinkAdmin, input: AttachCreditInput): Promise<AttachCreditResult> {
  const { data: credit, error: creditError } = await admin
    .from("crm_transactions")
    .select("id, customer_id, booking_id, payer_kind, billing_company_id, amount, currency, status, direction")
    .eq("id", input.id)
    .maybeSingle();
  if (creditError) return { ok: false, error: "Crédit introuvable." };
  if (!credit) return { ok: false, error: "Crédit introuvable." };
  if (credit.direction !== "credit" || credit.status !== "posted") {
    return { ok: false, error: "Seuls les crédits déjà encaissés se rattachent." };
  }
  const customerId = text(credit.customer_id);
  const { data: booking, error: bookingError } = await admin
    .from("crm_bookings")
    .select("id, reference, customer_id, billing_customer_id, archived_at")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingError || !booking) return { ok: false, error: "Dossier introuvable." };
  const owner = text(booking.customer_id);
  const payer = text(booking.billing_customer_id);
  if (owner !== customerId && payer !== customerId) {
    return { ok: false, error: "Ce dossier n’est pas celui de ce client." };
  }
  let companyId: string | null = null;
  if (input.payerKind === "company") {
    if (!input.companyId) return { ok: false, error: "Choisissez la société." };
    const companyRead = await admin
      .from("crm_billing_companies")
      .select("id, customer_id")
      .eq("id", input.companyId)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (companyRead.error || !companyRead.data) return { ok: false, error: "Cette société n’est pas sur la fiche." };
    if (text(companyRead.data.customer_id) !== customerId) {
      return { ok: false, error: "Cette société n’est pas sur la fiche." };
    }
    companyId = input.companyId;
  }
  const same =
    text(credit.booking_id) === input.bookingId &&
    text(credit.payer_kind) === input.payerKind &&
    text(credit.billing_company_id) === (companyId || "");
  const amount = Number(credit.amount);
  const currency = text(credit.currency) || "EUR";
  if (same) {
    return {
      ok: true,
      deja: true,
      mouvement_id: text(credit.id),
      client_id: customerId,
      montant: amount,
      devise: currency,
      dossier_id: input.bookingId,
      reference: text(booking.reference),
      payeur: input.payerKind,
      societe_id: companyId,
    };
  }
  const { data: updated, error: updateError } = await admin
    .from("crm_transactions")
    .update({
      booking_id: input.bookingId,
      payer_kind: input.payerKind,
      billing_company_id: companyId,
    })
    .eq("id", input.id)
    .select("id, amount")
    .single();
  if (updateError || !updated) return { ok: false, error: "Rattachement impossible." };
  if (Number(updated.amount) !== amount) return { ok: false, error: "Le montant ne se modifie pas." };
  return {
    ok: true,
    deja: false,
    mouvement_id: text(credit.id),
    client_id: customerId,
    montant: amount,
    devise: currency,
    dossier_id: input.bookingId,
    reference: text(booking.reference),
    payeur: input.payerKind,
    societe_id: companyId,
  };
}
