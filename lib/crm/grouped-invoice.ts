import { AGENCY_FEE_LABEL } from "@/lib/crm/agency-fee-rate";
import { COMMERCIAL_DISCOUNT_LABEL } from "@/lib/crm/commercial-discount";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { groupIban } from "@/lib/crm/revolut-wire";
import { visibleLedgerRows } from "@/lib/crm/ledger-display";
import {
  saleLines,
  withCommercialDiscountSale,
  type SaleLedgerRow,
  type SaleLine,
} from "@/lib/crm/trip-costs";
import {
  addIsoDays,
  cleanIban,
  parisIsoDate,
  roundMoney,
  validBic,
  validIban,
  type InvoiceWire,
} from "@/lib/crm/invoice-document";
import { siteConfig } from "@/lib/site";

/**
 * Facture pro forma du CRM pour plusieurs dossiers du même payeur.
 * Le PDF n’est pas une pièce MB3M. La pièce MB3M, quand elle est créée, reste une pro forma :
 * rien n’est imprimé, validé ni finalisé. Le client ne lit ni IATA ni APST.
 */

export const GROUPED_INVOICE_KIND = "facture";
export const GROUPED_INVOICE_MIN = 2;
export const GROUPED_INVOICE_MAX = 30;

export type PayerRef = {
  kind: "company" | "personal";
  companyId: string | null;
};

export type GroupedPayment = {
  label: string;
  amount: number;
  amountLabel: string;
};

export type GroupedSection = {
  bookingId: string;
  reference: string;
  destination: string;
  dates: string;
  travelers: string[];
  /** Vrai si le dossier porte la commission d’agence. La ligne, elle, vient du livre. */
  commission: boolean;
  lines: { label: string; amount: number; amountLabel: string }[];
  subtotal: number;
  subtotalLabel: string;
  payments: GroupedPayment[];
  paid: number;
  paidLabel: string;
  balance: number;
  balanceLabel: string;
  surplus: number;
  surplusLabel: string | null;
  foreignPayments: boolean;
};

export type GroupedInvoiceDocument = {
  kicker: "Facture pro forma";
  number: string;
  numberLabel: string;
  billTo: string[];
  payerLabel: string;
  sections: GroupedSection[];
  total: number;
  totalLabel: string;
  paid: number;
  paidLabel: string;
  balance: number;
  balanceLabel: string;
  surplus: number;
  surplusLabel: string | null;
  issuedOn: string;
  issuedLabel: string;
  dueLabel: string;
  issuer: string[];
  legal: string[];
  paymentLines: string[];
  paymentMissing: boolean;
  filename: string;
  /** Tout le texte imprimé, pour refuser IATA, APST et le nom du logiciel. */
  clientText: string;
};

export function payerRefOf(booking: {
  payer_kind?: string | null;
  billing_company_id?: string | null;
}): PayerRef {
  if (booking.payer_kind === "company" && booking.billing_company_id) {
    return { kind: "company", companyId: booking.billing_company_id };
  }
  return { kind: "personal", companyId: null };
}

export function payerKey(ref: PayerRef) {
  return ref.kind === "company" && ref.companyId ? `company:${ref.companyId}` : "personal";
}

export function samePayer(rows: { payer_kind?: string | null; billing_company_id?: string | null }[]) {
  if (!rows.length) return true;
  const key = payerKey(payerRefOf(rows[0]));
  return rows.every((row) => payerKey(payerRefOf(row)) === key);
}

/** Lignes de vente déjà au livre, plus la remise commerciale négative. La commission n’est pas recalculée. */
export function groupedSaleLines(bookingId: string, debits: SaleLedgerRow[], discountEuros: number): SaleLine[] {
  const rows = debits
    .filter((row) => row.booking_id === bookingId)
    .map((row) => ({
      ...row,
      booking_id: bookingId,
      direction: row.direction,
      kind: row.kind || "booking",
      external_id: row.external_id ?? null,
    }));
  return withCommercialDiscountSale(saleLines(visibleLedgerRows(rows), bookingId), discountEuros);
}

function money(amount: number) {
  return formatMoney(amount, "EUR");
}

function splitBalance(total: number, paid: number) {
  const raw = roundMoney(total - paid);
  return {
    balance: raw > 0 ? raw : 0,
    surplus: raw < 0 ? roundMoney(-raw) : 0,
  };
}

export function groupedIssuerLines() {
  const { legal, address } = siteConfig;
  return [
    legal.legalName,
    legal.legalForm,
    `Capital de ${legal.capital}`,
    address.line1,
    `${address.postalCode} ${address.city}`,
    address.country,
    `SIREN ${legal.siren}`,
    `SIRET ${legal.siret}`,
    `TVA ${legal.vat}`,
    legal.rcs,
    `Atout France ${legal.atoutFrance}`,
    legal.invoicePhone,
    siteConfig.contactEmail,
  ];
}

export function groupedLegalLines(dueDays: number | null, outsideEu: boolean) {
  const { legal, address } = siteConfig;
  const payment =
    dueDays == null
      ? "Payable à réception. Aucun escompte pour paiement anticipé."
      : `Payable sous ${dueDays} jour${dueDays > 1 ? "s" : ""}. Aucun escompte pour paiement anticipé.`;
  const margin = "TVA sur la marge, article 297 A du CGI. TVA non déductible.";
  return [
    `${legal.legalName} — ${legal.legalForm} au capital de ${legal.capital} — SIRET ${legal.siret}`,
    `${legal.rcs} — TVA ${legal.vat}`,
    `${address.full} — ${legal.invoicePhone} — ${siteConfig.contactEmail}`,
    `Immatriculation Atout France ${legal.atoutFrance}`,
    outsideEu ? `Client établi hors Union européenne. ${margin}` : margin,
    payment,
    "En cas de retard : pénalités au taux légal et indemnité forfaitaire de 40 EUR pour frais de recouvrement (art. L441-10 du code de commerce).",
    "Facture pro forma. Elle ne tient pas lieu de facture définitive tant que les séjours ne sont pas soldés.",
  ];
}

export type GroupedSectionInput = {
  bookingId: string;
  reference: string;
  destination: string;
  dates: string;
  travelers: string[];
  commission: boolean;
  lines: { label: string; amount: number }[];
  payments: { label: string; amount: number }[];
  foreignPayments?: boolean;
};

export function groupedInvoiceDocument(input: {
  number: string;
  billTo: string[];
  payerLabel: string;
  sections: GroupedSectionInput[];
  now?: Date;
  dueDays?: number | null;
  wire?: InvoiceWire | null;
  outsideEu?: boolean;
}): GroupedInvoiceDocument {
  const now = input.now || new Date();
  const issuedOn = parisIsoDate(now);
  const dueDays = input.dueDays == null || !Number.isFinite(input.dueDays) ? null : Math.trunc(input.dueDays);
  const dueOn = dueDays == null ? null : addIsoDays(issuedOn, Math.max(0, dueDays));
  const sections: GroupedSection[] = input.sections.map((section) => {
    const lines = section.lines.map((line) => {
      const amount = roundMoney(Number(line.amount) || 0);
      return { label: (line.label || "").trim() || "Prestation", amount, amountLabel: money(amount) };
    });
    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
    const payments = section.payments
      .map((row) => {
        const amount = roundMoney(Number(row.amount) || 0);
        return { label: (row.label || "").trim() || "Paiement", amount, amountLabel: money(amount) };
      })
      .filter((row) => row.amount > 0);
    const paid = roundMoney(payments.reduce((sum, row) => sum + row.amount, 0));
    const remain = splitBalance(subtotal, paid);
    return {
      bookingId: section.bookingId,
      reference: section.reference.trim(),
      destination: section.destination.trim(),
      dates: section.dates.trim(),
      travelers: section.travelers.map((name) => name.trim()).filter(Boolean),
      commission: section.commission === true,
      lines,
      subtotal,
      subtotalLabel: money(subtotal),
      payments,
      paid,
      paidLabel: money(paid),
      balance: remain.balance,
      balanceLabel: money(remain.balance),
      surplus: remain.surplus,
      surplusLabel: remain.surplus > 0 ? money(remain.surplus) : null,
      foreignPayments: section.foreignPayments === true,
    };
  });
  const total = roundMoney(sections.reduce((sum, section) => sum + section.subtotal, 0));
  const paid = roundMoney(sections.reduce((sum, section) => sum + section.paid, 0));
  const remain = splitBalance(total, paid);
  const number = input.number.trim();
  const iban = validIban(input.wire?.iban);
  const bic = validBic(input.wire?.bic) || "";
  const holder = (input.wire?.holder || "").trim();
  const references = sections.map((section) => section.reference).filter(Boolean).join(", ");
  const wireRef = [references, number ? `facture ${number}` : ""].filter(Boolean).join(" · ");
  const paymentLines = iban
    ? [
        holder || siteConfig.legal.legalName,
        `IBAN ${groupIban(iban)}`,
        bic ? `BIC ${bic}` : "",
        wireRef ? `Référence ${wireRef}` : "",
      ].filter(Boolean)
    : [];
  const issuer = groupedIssuerLines();
  const legal = groupedLegalLines(dueDays, input.outsideEu === true);
  const doc: GroupedInvoiceDocument = {
    kicker: "Facture pro forma",
    number,
    numberLabel: number ? `N° ${number}` : "Sans numéro",
    billTo: input.billTo.map((line) => line.trim()).filter(Boolean),
    payerLabel: input.payerLabel.trim(),
    sections,
    total,
    totalLabel: money(total),
    paid,
    paidLabel: money(paid),
    balance: remain.balance,
    balanceLabel: money(remain.balance),
    surplus: remain.surplus,
    surplusLabel: remain.surplus > 0 ? money(remain.surplus) : null,
    issuedOn,
    issuedLabel: formatDateFr(issuedOn),
    dueLabel: dueOn ? formatDateFr(dueOn) : "À réception",
    issuer,
    legal,
    paymentLines,
    paymentMissing: !iban,
    filename: number ? `Facture-pro-forma-${number}.pdf` : "Facture-pro-forma-groupee.pdf",
    clientText: "",
  };
  doc.clientText = groupedClientText(doc);
  return doc;
}

export function groupedClientText(doc: Pick<
  GroupedInvoiceDocument,
  "kicker" | "numberLabel" | "payerLabel" | "billTo" | "sections" | "totalLabel" | "paidLabel" | "balanceLabel" | "surplusLabel" | "issuedLabel" | "dueLabel" | "issuer" | "legal" | "paymentLines"
>) {
  const parts = [
    doc.kicker,
    doc.numberLabel,
    doc.payerLabel,
    ...doc.billTo,
    ...doc.issuer,
    ...doc.legal,
    ...doc.paymentLines,
    doc.issuedLabel,
    doc.dueLabel,
    doc.totalLabel,
    doc.paidLabel,
    doc.balanceLabel,
    doc.surplusLabel || "",
  ];
  for (const section of doc.sections) {
    parts.push(
      section.reference,
      section.destination,
      section.dates,
      ...section.travelers,
      ...section.lines.flatMap((line) => [line.label, line.amountLabel]),
      section.subtotalLabel,
      section.paidLabel,
      section.balanceLabel,
      section.surplusLabel || "",
      ...section.payments.flatMap((row) => [row.label, row.amountLabel]),
      section.foreignPayments ? "Un paiement hors euros n’est pas converti." : ""
    );
  }
  return parts.filter(Boolean).join("\n");
}

const FORBIDDEN_CLIENT_MARK = /\bIATA\b|\bAPST\b|MB3M/i;

export function groupedInvoiceClientMarks(text: string) {
  return text.match(FORBIDDEN_CLIENT_MARK)?.[0] || null;
}

export function nextGroupedNumber(existing: string[], year: number) {
  const prefix = `FG-${year}-`;
  let max = 0;
  for (const value of existing) {
    if (!value.startsWith(prefix)) continue;
    const seq = Number(value.slice(prefix.length));
    if (Number.isInteger(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export type GroupedBookingRow = {
  id: string;
  reference: string;
  customer_id: string | null;
  billing_customer_id: string | null;
  payer_kind: string | null;
  billing_company_id: string | null;
  status: string | null;
  archived_at: string | null;
  currency: string | null;
  agency_commission?: boolean | null;
};

export function groupedBookingRefusal(booking: GroupedBookingRow, customerId: string): string | null {
  const onFiche = booking.customer_id === customerId || booking.billing_customer_id === customerId;
  if (!onFiche) return `${booking.reference} n’est pas sur cette fiche.`;
  if (booking.archived_at) return `${booking.reference} est archivé.`;
  if (booking.status === "cancelled") return `${booking.reference} est annulé.`;
  const currency = (booking.currency || "EUR").trim().toUpperCase() || "EUR";
  if (currency !== "EUR") return `La facture groupée est en euros. ${booking.reference} est en ${currency}.`;
  return null;
}

export function assertGroupedSelection(bookings: GroupedBookingRow[], customerId: string): string | null {
  if (bookings.length < GROUPED_INVOICE_MIN) return "Cochez au moins deux dossiers du même payeur.";
  if (bookings.length > GROUPED_INVOICE_MAX) return `Trente dossiers au plus.`;
  for (const booking of bookings) {
    const refusal = groupedBookingRefusal(booking, customerId);
    if (refusal) return refusal;
  }
  if (!samePayer(bookings)) return "Ces dossiers ne sont pas payés par la même entité.";
  return null;
}

type CreditRow = {
  booking_id?: string | null;
  direction?: string | null;
  status?: string | null;
  currency?: string | null;
  amount?: number | string | null;
  label?: string | null;
};

export function paymentsForBooking(bookingId: string, credits: CreditRow[]) {
  let foreign = false;
  const payments: { label: string; amount: number }[] = [];
  for (const row of credits) {
    if (row.booking_id !== bookingId) continue;
    if (row.direction && row.direction !== "credit") continue;
    if (row.status && row.status !== "posted") continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = (row.currency || "EUR").trim().toUpperCase() || "EUR";
    if (currency !== "EUR") {
      foreign = true;
      continue;
    }
    payments.push({ label: (row.label || "").trim() || "Paiement", amount: roundMoney(amount) });
  }
  return { payments, foreign };
}

export type GroupedStayInput = {
  bookingId: string;
  reference: string;
  destination: string;
  dates: string;
  travelers: string[];
  commission: boolean;
  debits: SaleLedgerRow[];
  credits: CreditRow[];
  discountEuros: number;
};

/** Une section par dossier. Sans ligne de vente, le dossier est nommé et la facture ne part pas. */
export function composeGroupedSections(stays: GroupedStayInput[]): { sections: GroupedSectionInput[] } | { error: string } {
  const sections: GroupedSectionInput[] = [];
  for (const stay of stays) {
    const sales = groupedSaleLines(stay.bookingId, stay.debits, stay.discountEuros);
    if (!sales.length) return { error: `Aucune ligne de vente pour ${stay.reference}.` };
    const received = paymentsForBooking(stay.bookingId, stay.credits);
    sections.push({
      bookingId: stay.bookingId,
      reference: stay.reference,
      destination: stay.destination,
      dates: stay.dates,
      travelers: stay.travelers,
      commission: stay.commission,
      lines: sales.map((line) => ({ label: line.label, amount: line.sale })),
      payments: received.payments,
      foreignPayments: received.foreign,
    });
  }
  return { sections };
}

/** Le libellé client de la commission, sans le pourcentage. */
export function isAgencyCommissionLabel(label: string) {
  return label.trim() === AGENCY_FEE_LABEL;
}

export function isCommercialDiscountLabel(label: string) {
  return label.trim() === COMMERCIAL_DISCOUNT_LABEL;
}

/** Le RIB saisi ne sort pas tel quel : on ne garde qu’un IBAN valide. */
export function groupedWireOf(wire: InvoiceWire | null | undefined) {
  if (!wire) return null;
  const iban = validIban(cleanIban(wire.iban));
  if (!iban) return null;
  return { ...wire, iban };
}

/** La facture d’un seul dossier reste le document déjà en place. Celle-ci n’en reprend pas le numéro. */
export function groupedNumberIsLocal(number: string) {
  return /^FG-\d{4}-\d{4}$/.test(number.trim());
}
