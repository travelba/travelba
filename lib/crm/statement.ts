import type { ClientLedgerView, ClientLedgerWallet } from "./client-ledger";
import type { LedgerMovementRow } from "./ledger-movement";
import { encoursCaption } from "./money";
import type { SpendingCard } from "./spending-desk";

export const STATEMENT_FILENAME = "Releve-de-compte.pdf";

/** Colonnes lues pour le relevé. Pas d’IBAN, pas de pièce d’identité. */
export const STATEMENT_CUSTOMER_COLUMNS =
  "id, first_name, last_name, email, phone, company_name, company_role, billing_parent_id, spending_allowance, address_line, postal_code, city, country, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country";

export type StatementHolder = {
  company_name?: string | null;
  email?: string | null;
  billing_email?: string | null;
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  billing_address_line?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;
  billing_country?: string | null;
};

export type StatementSummary = {
  label: string;
  value: string;
  hint: string | null;
};

export type StatementRow = {
  date: string;
  title: string;
  meta: string | null;
  debit: string;
  credit: string;
};

export type StatementStay = {
  title: string;
  meta: string;
  amount: string;
  rows: StatementRow[];
};

export type StatementSection = {
  heading: string;
  stays: StatementStay[];
  rows: StatementRow[];
};

export type StatementAllowance = {
  name: string;
  remaining: string;
  allowance: string;
};

export type StatementModel = {
  title: string;
  issuedOn: string;
  number: string;
  holderName: string;
  holderLines: string[];
  summaries: StatementSummary[];
  allowances: StatementAllowance[];
  sections: StatementSection[];
  emptyNote: string | null;
};

export type StatementAudience = "client" | "staff";

/** Montant du relevé : espace simple, virgule, code devise. Pas de signe euro (police PDF). */
export function formatStatementMoney(amount: number, currency = "EUR") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  const negative = n < 0;
  const [whole, frac] = Math.abs(n).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negative ? "-" : ""}${grouped},${frac} ${(currency || "EUR").toUpperCase()}`;
}

/** Libellé déjà affiché dans Transactions, sans le signe, lisible dans le PDF. */
export function statementAmountLabel(label: string) {
  return label
    .replace(/^[+−\-]\s*/u, "")
    .replace(/\u202f/g, " ")
    .replace(/\u00a0/g, " ")
    .replace("€", "EUR")
    .replace(/\s+/g, " ")
    .trim();
}

export function statementHolderLines(holder: StatementHolder) {
  const lines: string[] = [];
  const company = holder.company_name?.trim();
  if (company) lines.push(company);
  const address = (holder.billing_address_line || holder.address_line || "").trim();
  const postal = (holder.billing_postal_code || holder.postal_code || "").trim();
  const city = (holder.billing_city || holder.city || "").trim();
  const country = (holder.billing_country || holder.country || "").trim();
  if (address) lines.push(address);
  const cityLine = [postal, city].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  if (country && !/^fr(ance)?$/i.test(country)) lines.push(country);
  const email = (holder.billing_email || holder.email || "").trim();
  if (email) lines.push(email);
  return lines;
}

function parisParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

export function statementIssuedOn(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function statementNumber(date: Date) {
  const { year, month, day } = parisParts(date);
  return `REL-${year}${month}${day}`;
}

/** Fichier privé du relevé envoyé à WhatsApp. Vide si l’identifiant n’est pas un compte. */
export function statementObjectPath(customerId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)) return null;
  return `customers/${customerId}/releves/releve-de-compte.pdf`;
}

function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

function movementRow(row: LedgerMovementRow): StatementRow {
  const amount = statementAmountLabel(row.amountLabel);
  const meta = [row.whenWhere, row.reference, row.companyLabel].filter(Boolean).join(" · ") || null;
  return {
    date: row.occurredLabel === "—" ? "" : row.occurredLabel,
    title: row.title,
    meta,
    debit: row.credit ? "" : amount,
    credit: row.credit ? amount : "",
  };
}

function encoursHint(wallet: ClientLedgerWallet) {
  if (wallet.debits > 0 && wallet.remaining <= 0) return "Soldé";
  const caption = encoursCaption(wallet.balanceValue);
  if (wallet.balanceValue < 0 && wallet.remainingPct != null && wallet.remaining > 0) {
    const settled = Math.max(0, 100 - wallet.remainingPct);
    return `${caption} · ${settled} % réglé`;
  }
  return caption;
}

function walletSummaries(wallets: ClientLedgerWallet[], several: boolean): StatementSummary[] {
  return wallets.flatMap((wallet) => {
    const currency = wallet.currency || "EUR";
    const mark = several ? ` ${currency.toUpperCase()}` : "";
    return [
      {
        label: `Encours${mark}`,
        value: formatStatementMoney(wallet.balanceValue, currency),
        hint: encoursHint(wallet),
      },
      {
        label: `Dépenses${mark}`,
        value: formatStatementMoney(wallet.debits, currency),
        hint: null,
      },
      {
        label: `Règlements${mark}`,
        value: formatStatementMoney(roundMoney(wallet.balanceValue + wallet.debits), currency),
        hint: null,
      },
    ];
  });
}

function stayBlock(card: SpendingCard): StatementStay {
  return {
    title: card.title,
    meta: [card.dates, card.reference, card.accountName, card.remainingLabel].filter(Boolean).join(" · "),
    amount: statementAmountLabel(card.amountLabel),
    rows: card.movements.map(movementRow),
  };
}

/** Même lecture que Transactions : mouvements comptabilisés, solde signé. */
export function buildStatement(input: {
  view: ClientLedgerView;
  holderName: string;
  holderLines: string[];
  issuedAt: Date;
}): StatementModel {
  const { view } = input;
  const member = view.member;
  const spending = view.spending;
  const title = member ? "Relevé de frais" : "Relevé de compte";
  const wallets = view.wallets?.length
    ? view.wallets
    : [
        {
          currency: view.currency,
          balanceValue: view.balanceValue,
          debits: view.debits,
          remaining: view.remaining,
          remainingPct: view.remainingPct,
          creditCount: view.creditCount,
        },
      ];

  let summaries: StatementSummary[];
  if (member && spending?.own) {
    const currency = spending.currency || view.currency;
    summaries = [
      { label: "Reste", value: formatStatementMoney(spending.own.remaining, currency), hint: null },
      { label: "Droit de dépense", value: formatStatementMoney(spending.own.allowance, currency), hint: null },
      { label: "Engagé", value: formatStatementMoney(spending.own.spent, currency), hint: null },
    ];
  } else if (member) {
    summaries = [
      {
        label: "Total de vos dossiers",
        value: formatStatementMoney(view.debits, view.currency),
        hint: "Votre société règle ces voyages.",
      },
    ];
  } else if (view.pockets?.length) {
    summaries = view.pockets.flatMap((pocket) => {
      const wallet: ClientLedgerWallet = {
        currency: view.currency,
        balanceValue: pocket.balance,
        debits: pocket.debits,
        remaining: pocket.due,
        remainingPct: pocket.funding === "advance" && pocket.balance > 0 ? null : pocket.remainingPct,
        creditCount: pocket.creditCount,
      };
      return [
        {
          label: pocket.label,
          value: formatStatementMoney(pocket.balance, view.currency),
          hint: pocket.funding === "advance" && pocket.balance > 0 ? "Crédit à dépenser" : encoursHint(wallet),
        },
        {
          label: `Dépenses · ${pocket.label}`,
          value: formatStatementMoney(pocket.debits, view.currency),
          hint: null,
        },
        {
          label: `Règlements · ${pocket.label}`,
          value: formatStatementMoney(roundMoney(pocket.balance + pocket.debits), view.currency),
          hint: null,
        },
      ];
    });
  } else {
    summaries = walletSummaries(wallets, wallets.length > 1);
  }

  const allowances: StatementAllowance[] =
    !member && spending?.accounts.length
      ? spending.accounts.map((account) => ({
          name: account.name,
          remaining: formatStatementMoney(account.remaining, spending.currency),
          allowance: formatStatementMoney(account.allowance, spending.currency),
        }))
      : [];

  const sections: StatementSection[] = [];
  if (spending) {
    sections.push({
      heading: "Réservations",
      stays: spending.cards.map(stayBlock),
      rows: [],
    });
    if (spending.otherMovements.length) {
      sections.push({
        heading: "Autres mouvements",
        stays: [],
        rows: spending.otherMovements.map(movementRow),
      });
    }
  } else {
    sections.push({
      heading: member ? "Frais de voyage" : "Mouvements",
      stays: [],
      rows: view.movements.map(movementRow),
    });
  }

  const hasLines = sections.some((section) => section.rows.length || section.stays.length);
  return {
    title,
    issuedOn: statementIssuedOn(input.issuedAt),
    number: statementNumber(input.issuedAt),
    holderName: input.holderName.trim() || "Client",
    holderLines: input.holderLines.map((line) => line.trim()).filter(Boolean),
    summaries,
    allowances,
    sections,
    emptyNote: hasLines ? null : "Aucun mouvement comptabilisé à cette date.",
  };
}

export function statementWhatsappBody(firstName: string | null | undefined, member: boolean) {
  const name = (firstName || "").replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  const hello = name ? `Bonjour ${name},` : "Bonjour,";
  const line = member ? "Voici le relevé des frais de vos voyages." : "Voici votre relevé de compte.";
  return [hello, "", line, "", "Travel Business Agency"].join("\n");
}

export function statementWhatsappFailure(detail: string | undefined, audience: StatementAudience) {
  if (detail === "no_phone") {
    return audience === "staff"
      ? "Ce client n’a pas de téléphone pour WhatsApp. Le relevé reste à télécharger."
      : "Ajoutez un téléphone dans Vous pour recevoir le relevé sur WhatsApp.";
  }
  if (detail === "not_configured") {
    return "WhatsApp n’est pas disponible. Le relevé reste à télécharger.";
  }
  return "WhatsApp n’a pas pu remettre le relevé. Téléchargez-le.";
}

export function statementWhatsappSuccess(audience: StatementAudience) {
  return audience === "staff"
    ? "Relevé envoyé sur le WhatsApp du client."
    : "Relevé envoyé sur votre WhatsApp.";
}
