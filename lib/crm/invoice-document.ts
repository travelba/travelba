import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { groupIban } from "@/lib/crm/revolut-wire";
import { siteConfig } from "@/lib/site";

/** Facture pro forma montrée au client. Aucune mention du logiciel de facturation. */

export type InvoiceLineInput = { label: string; amount: number; vatRate?: number | null };
export type InvoiceDepositInput = { amount: number; currency?: string | null };

export type InvoiceWire = {
  iban: string;
  bic: string;
  holder: string;
  source: "revolut" | "reglage";
};

export type InvoiceInput = {
  number: string;
  reference: string;
  title: string;
  dates: string;
  billTo: string[];
  lines: InvoiceLineInput[];
  deposits?: InvoiceDepositInput[];
  now?: Date;
  /** Null : payable à réception. Un nombre : jours après la date d’émission. */
  dueDays?: number | null;
  wire?: InvoiceWire | null;
  stripeUrl?: string | null;
  payerFirstName?: string | null;
  /** Société établie hors Union européenne. La mention de marge ne change pas de régime. */
  outsideEu?: boolean;
};

export type InvoiceDocument = {
  kicker: "Facture pro forma";
  number: string;
  numberLabel: string;
  reference: string;
  title: string;
  dates: string;
  billTo: string[];
  lines: { label: string; amount: number; amountLabel: string }[];
  total: number;
  totalLabel: string;
  deposits: number;
  depositsLabel: string;
  balance: number;
  balanceLabel: string;
  surplus: number;
  surplusLabel: string | null;
  foreignDeposits: boolean;
  issuedOn: string;
  issuedLabel: string;
  dueLabel: string;
  vatMode: "marge" | "detail";
  htLabel: string | null;
  taxLabel: string | null;
  issuer: string[];
  legal: string[];
  paymentLines: string[];
  paymentMissing: boolean;
  stripeUrl: string | null;
  missing: string[];
  subject: string;
  message: string;
  filename: string;
  payerFirstName: string;
};

const STRIPE_HOSTS = new Set(["buy.stripe.com", "pay.stripe.com", "checkout.stripe.com", "invoice.stripe.com"]);

export function parisIsoDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addIsoDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, (day || 1) + days));
  return date.toISOString().slice(0, 10);
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function cleanIban(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, "").toUpperCase();
}

export function validIban(value: string | null | undefined) {
  const iban = cleanIban(value);
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) ? iban : null;
}

export function validBic(value: string | null | undefined) {
  const bic = (value || "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic) ? bic : null;
}

/** Lien de paiement Stripe déjà émis. Toute autre adresse est refusée. */
export function stripePayUrlOf(value: unknown) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 400) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (!STRIPE_HOSTS.has(url.hostname)) return null;
  if (url.pathname === "/" || url.pathname === "") return null;
  return url.toString();
}

export function pickStripePayUrl(
  links: { url?: string | null; active?: boolean; metadata?: Record<string, string> | null }[],
  bookingId: string,
  reference: string
) {
  const ref = reference.trim().toLowerCase();
  for (const link of links) {
    if (link.active === false) continue;
    const url = stripePayUrlOf(link.url);
    if (!url) continue;
    const meta = link.metadata || {};
    const id = (meta.crm_booking_id || meta.booking_id || "").trim();
    const metaRef = (meta.reference || meta.crm_reference || "").trim().toLowerCase();
    if ((bookingId && id === bookingId) || (ref && metaRef === ref)) return url;
  }
  return null;
}

export function invoiceIssuerLines() {
  const { legal, address } = siteConfig;
  return [
    legal.legalName,
    `${legal.legalForm} au capital de ${legal.capital}`,
    address.line1,
    `${address.postalCode} ${address.city}`,
    address.country,
    `SIREN ${legal.siren}`,
    `SIRET ${legal.siret}`,
    `TVA ${legal.vat}`,
    legal.rcs,
    `IATA ${legal.iata}`,
    `Atout France ${legal.atoutFrance}`,
    `APST n° ${legal.apstNumber}`,
    legal.invoicePhone,
    siteConfig.contactEmail,
  ];
}

function money(amount: number) {
  return formatMoney(amount, "EUR");
}

function depositSums(rows: InvoiceDepositInput[]) {
  let eur = 0;
  let foreign = false;
  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = (row.currency || "EUR").trim().toUpperCase() || "EUR";
    if (currency !== "EUR") {
      foreign = true;
      continue;
    }
    eur += amount;
  }
  return { eur: roundMoney(eur), foreign };
}

function vatBreakdown(lines: InvoiceLineInput[]) {
  const usable = lines.filter((line) => Number.isFinite(line.amount));
  const rated = usable.filter((line) => line.vatRate != null && Number(line.vatRate) > 0);
  if (!rated.length || rated.length !== usable.length) return null;
  let ht = 0;
  let tax = 0;
  for (const line of rated) {
    const rate = Number(line.vatRate);
    const ttc = Number(line.amount);
    const net = roundMoney(ttc / (1 + rate / 100));
    ht += net;
    tax += roundMoney(ttc - net);
  }
  return { ht: roundMoney(ht), tax: roundMoney(tax) };
}

export function invoiceDocument(input: InvoiceInput): InvoiceDocument {
  const now = input.now || new Date();
  const issuedOn = parisIsoDate(now);
  const dueDays = input.dueDays == null || !Number.isFinite(input.dueDays) ? null : Math.trunc(input.dueDays);
  const dueOn = dueDays == null ? null : addIsoDays(issuedOn, Math.max(0, dueDays));
  const dueLabel = dueOn ? formatDateFr(dueOn) : "À réception";
  const rawLines = input.lines.length
    ? input.lines
    : [{ label: input.title.trim() || "Séjour", amount: 0 }];
  const lines = rawLines.map((line) => {
    const amount = roundMoney(Number(line.amount) || 0);
    const label = (line.label || "").trim() || "Prestation";
    return { label, amount, amountLabel: money(amount) };
  });
  const total = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  const paid = depositSums(input.deposits || []);
  const rawBalance = roundMoney(total - paid.eur);
  const balance = rawBalance > 0 ? rawBalance : 0;
  const surplus = rawBalance < 0 ? roundMoney(-rawBalance) : 0;
  const vat = vatBreakdown(rawLines);
  const vatMode = vat ? "detail" : "marge";
  const iban = validIban(input.wire?.iban);
  const bic = validBic(input.wire?.bic) || "";
  const holder = (input.wire?.holder || "").trim();
  const paymentMissing = !iban;
  const reference = (input.reference || "").trim();
  const number = (input.number || "").trim();
  const wireRef = [reference, number ? `facture ${number}` : ""].filter(Boolean).join(" · ");
  const paymentLines = paymentMissing
    ? []
    : [
        holder || siteConfig.legal.legalName,
        `IBAN ${groupIban(iban)}`,
        bic ? `BIC ${bic}` : "",
        wireRef ? `Référence ${wireRef}` : "",
      ].filter(Boolean);
  const stripeUrl = stripePayUrlOf(input.stripeUrl);
  const missing: string[] = [];
  if (paymentMissing) missing.push("RIB (IBAN) : Revolut ne le fournit pas et le réglage Facture est vide.");
  if (paid.foreign) missing.push("Un acompte hors euros n’est pas converti.");
  const legal = invoiceLegalLines(vatMode, dueDays, input.outsideEu === true);
  const payerFirstName = (input.payerFirstName || "").trim();
  const title = (input.title || "").trim() || reference || "Séjour";
  const doc: InvoiceDocument = {
    kicker: "Facture pro forma",
    number,
    numberLabel: number ? `N° ${number}` : "Sans numéro",
    reference,
    title,
    dates: (input.dates || "").trim(),
    billTo: input.billTo.map((line) => line.trim()).filter(Boolean),
    lines,
    total,
    totalLabel: money(total),
    deposits: paid.eur,
    depositsLabel: money(paid.eur),
    balance,
    balanceLabel: money(balance),
    surplus,
    surplusLabel: surplus > 0 ? money(surplus) : null,
    foreignDeposits: paid.foreign,
    issuedOn,
    issuedLabel: formatDateFr(issuedOn),
    dueLabel,
    vatMode,
    htLabel: vat ? money(vat.ht) : null,
    taxLabel: vat ? money(vat.tax) : null,
    issuer: invoiceIssuerLines(),
    legal,
    paymentLines,
    paymentMissing,
    stripeUrl,
    missing,
    subject: "",
    message: "",
    filename: number ? `Facture-pro-forma-${number}.pdf` : "Facture-pro-forma.pdf",
    payerFirstName,
  };
  doc.subject = `Facture pro forma ${doc.numberLabel}${reference ? ` — ${reference}` : ""}`;
  doc.message = invoiceMessage(doc);
  return doc;
}

export function invoiceLegalLines(vatMode: "marge" | "detail", dueDays: number | null, outsideEu = false) {
  const { legal, address } = siteConfig;
  const payment =
    dueDays == null
      ? "Payable à réception. Aucun escompte pour paiement anticipé."
      : `Payable sous ${dueDays} jour${dueDays > 1 ? "s" : ""}. Aucun escompte pour paiement anticipé.`;
  const margin =
    "TVA sur la marge, article 297 A du CGI. TVA non déductible.";
  return [
    `${legal.legalName} — ${legal.legalForm} au capital de ${legal.capital} — SIRET ${legal.siret}`,
    `${legal.rcs} — TVA ${legal.vat}`,
    `${address.full} — ${legal.invoicePhone} — ${siteConfig.contactEmail}`,
    `Immatriculation Atout France ${legal.atoutFrance} — IATA ${legal.iata}`,
    `Garantie financière : APST n° ${legal.apstNumber}, 15 avenue Carnot, 75017 Paris.`,
    vatMode === "marge"
      ? outsideEu
        ? `Client établi hors Union européenne. ${margin}`
        : margin
      : "Montants hors taxe, TVA et toutes taxes comprises selon les lignes.",
    payment,
    "En cas de retard : pénalités au taux légal et indemnité forfaitaire de 40 EUR pour frais de recouvrement (art. L441-10 du code de commerce).",
    "Facture pro forma. Elle ne tient pas lieu de facture définitive tant que le séjour n’est pas soldé.",
  ];
}

export function invoiceMessage(doc: InvoiceDocument) {
  const hello = doc.payerFirstName ? `Bonjour ${doc.payerFirstName},` : "Bonjour,";
  const stay = doc.reference ? `${doc.title} (${doc.reference})` : doc.title;
  const lines = [
    hello,
    "",
    `Voici la facture pro forma ${doc.numberLabel} pour votre séjour ${stay}.`,
    "",
    `Montant : ${doc.totalLabel}`,
    `Acomptes déjà versés : ${doc.depositsLabel}`,
    `Reste à payer : ${doc.balanceLabel}`,
    doc.surplusLabel ? `Trop-perçu : ${doc.surplusLabel}` : "",
    `Échéance : ${doc.dueLabel}`,
    "",
    doc.paymentMissing
      ? "Les coordonnées de virement vous seront confirmées par l’agence."
      : ["Règlement par virement :", ...doc.paymentLines].join("\n"),
    "",
    doc.stripeUrl ? `Paiement par carte : ${doc.stripeUrl}` : "",
    doc.stripeUrl ? "" : "",
    "La facture est jointe à ce message.",
    "",
    siteConfig.legal.legalName,
    siteConfig.legal.invoicePhone,
    siteConfig.contactEmail,
  ];
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const INVOICE_TEMPLATE_NAME = "facture_paiement";
export const INVOICE_TEMPLATE_ENV = "TWILIO_CONTENT_FACTURE";

const TEMPLATE_BODY = [
  "Bonjour {{2}},",
  "",
  "Votre facture {{3}} est jointe à ce message. Reste à payer : {{4}}.",
  "",
  "{{5}}",
  "{{6}}",
  "",
  siteConfig.legal.legalName,
].join("\n");

export function invoiceTemplateVariables(doc: InvoiceDocument, mediaPath: string) {
  if (!mediaPath.endsWith(".pdf") || mediaPath.includes("..") || /^https?:/i.test(mediaPath)) return null;
  const name = doc.payerFirstName.replace(/[\r\n]+/g, " ").trim().slice(0, 40) || " ";
  const payment = doc.paymentMissing
    ? "Le virement est confirmé par l’agence."
    : doc.paymentLines.join(" · ").replace(/[\r\n]+/g, " ").slice(0, 240);
  const link = doc.stripeUrl
    ? `Paiement par carte : ${doc.stripeUrl}`
    : "Le détail est sur la facture.";
  return {
    "1": mediaPath,
    "2": name,
    "3": doc.numberLabel,
    "4": doc.balanceLabel.replace(/[\u202f\u00a0]/g, " "),
    "5": payment,
    "6": link,
  };
}

export function invoiceTemplatePreview(doc: InvoiceDocument) {
  const variables = invoiceTemplateVariables(doc, "exemple/facture.pdf");
  if (!variables) return null;
  return TEMPLATE_BODY.replace("{{2}}", variables["2"].trim() || "")
    .replace("{{3}}", variables["3"])
    .replace("{{4}}", variables["4"])
    .replace("{{5}}", variables["5"])
    .replace("{{6}}", variables["6"])
    .replace("Bonjour ,", "Bonjour,");
}

export function invoiceContentDraft() {
  return {
    template: INVOICE_TEMPLATE_NAME,
    env: INVOICE_TEMPLATE_ENV,
    friendlyName: INVOICE_TEMPLATE_NAME,
    category: "UTILITY" as const,
    create: {
      friendly_name: INVOICE_TEMPLATE_NAME,
      language: "fr" as const,
      variables: {
        "1": "exemple/facture.pdf",
        "2": "Camille",
        "3": "N° 4531",
        "4": "1 050,00 €",
        "5": "IBAN FR76 ACCT-000003 7890 189 · BIC REVOFRP2 · Référence TB-EXEMPLE",
        "6": "Le détail est sur la facture.",
      },
      types: {
        "twilio/media": {
          body: TEMPLATE_BODY,
          media: [`${siteConfig.url}/api/whatsapp/factures/{{1}}`],
        },
      },
    },
  };
}

export function invoiceTemplateSubmission() {
  const draft = invoiceContentDraft();
  return [
    `Modèle WhatsApp ${draft.friendlyName} (Utility), variable ${draft.env}.`,
    "En-tête : document PDF.",
    "Corps :",
    TEMPLATE_BODY,
    "Variables : 1 fichier, 2 prénom, 3 numéro, 4 reste à payer, 5 virement, 6 lien de paiement ou « Le détail est sur la facture. »",
    "Rien n’est envoyé tant que Meta n’a pas approuvé le modèle, hors fenêtre de 24 h.",
  ].join("\n");
}
