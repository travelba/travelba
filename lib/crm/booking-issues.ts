import type { ZodError } from "zod";
import { parseMoney } from "./money";
import {
  BOOKING_ITEM_LABELS,
  countsAsCarnetCard,
  visibleServiceCopy,
  type BookingItemKind,
} from "./types";

export type BookingIssue = { field: string; message: string };

export class BookingIssuesError extends Error {
  issues: BookingIssue[];
  constructor(message: string, issues: BookingIssue[]) {
    super(message);
    this.name = "BookingIssuesError";
    this.issues = issues;
  }
}

export function issuesSummary(issues: BookingIssue[]) {
  if (!issues.length) return "";
  if (issues.length === 1) return issues[0].message;
  return `${issues.length} points empêchent l’enregistrement.`;
}

export function issuesFromResponse(json: { error?: string; issues?: BookingIssue[] }): BookingIssue[] {
  if (Array.isArray(json.issues) && json.issues.length) {
    return json.issues.filter((row) => row && typeof row.message === "string");
  }
  if (json.error) return [{ field: "form", message: json.error }];
  return [];
}

const FIELD_LABELS: Record<string, string> = {
  title: "Titre du voyage",
  customer_id: "Client",
  destination: "Destination",
  start_date: "Date de départ",
  end_date: "Date de retour",
  items: "Cartes",
  travelers: "Voyageurs",
  document_status: "Type de document",
  "items.title": "Titre de la carte",
  "items.kind": "Type de carte",
  "items.details.document_amount": "Prix document",
  email: "E-mail",
  first_name: "Prénom",
  last_name: "Nom",
};

export function fieldLabel(path: string) {
  if (FIELD_LABELS[path]) return FIELD_LABELS[path];
  const last = path.split(".").filter((part) => !/^\d+$/.test(part)).join(".");
  return FIELD_LABELS[last] || path.replace(/^\d+\./, "").replace(/\.\d+\./g, " · ");
}

export function zodIssuesToBookingIssues(error: ZodError): BookingIssue[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    const label = fieldLabel(path);
    if (issue.code === "invalid_type" || issue.code === "invalid_value") {
      return { field: path || "form", message: `${label} : valeur non conforme.` };
    }
    if (issue.code === "too_small") {
      return { field: path || "form", message: `${label} : champ obligatoire.` };
    }
    return { field: path || "form", message: `${label} : ${issue.message}` };
  });
}

export function collectManualCreateIssues(input: {
  customerId?: string;
  title?: string;
  customerFound?: boolean;
}): BookingIssue[] {
  const issues: BookingIssue[] = [];
  if (input.customerFound === false) {
    issues.push({ field: "customer_id", message: "Client introuvable." });
  }
  if (!String(input.title || "").trim()) {
    issues.push({ field: "title", message: "Le titre du voyage est obligatoire." });
  }
  return issues;
}

/** Hôtel, vol, transfert : le montant imprimé est exigé. Une formalité sans prix ne l’est pas. */
export function itemRequiresDocumentPrice(kind: string | null | undefined) {
  return kind === "flight" || kind === "hotel" || kind === "transfer";
}

/** Montant positif lu ou saisi. 0 et l’absence restent vides — on n’invente pas un prix. */
export function readDocumentAmount(details: { document_amount?: unknown } | null | undefined) {
  const raw = details?.document_amount;
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const amount = parseMoney(raw);
  if (amount == null || amount <= 0) return null;
  return amount;
}

type ExtractPriceItem = {
  title?: string | null;
  kind?: string | null;
  /** Prix vendu : ne remplace pas le prix document. */
  amount?: number | null;
  details?: { document_amount?: unknown; document_currency?: unknown } | null;
};

export function documentPriceIssues(extract: {
  document_status?: string | null;
  items?: ExtractPriceItem[];
}): BookingIssue[] {
  if (extract.document_status === "identity") return [];
  const issues: BookingIssue[] = [];
  (extract.items || []).forEach((item, index) => {
    if (!itemRequiresDocumentPrice(item.kind)) return;
    if (readDocumentAmount(item.details) != null) return;
    const kindLabel =
      BOOKING_ITEM_LABELS[(item.kind || "fee") as BookingItemKind] || "Carte";
    const title = visibleServiceCopy(String(item.title || "").trim());
    const who = title ? `${kindLabel} « ${title} »` : `${kindLabel} (carte ${index + 1})`;
    issues.push({
      field: `items.${index}.details.document_amount`,
      message: `${who} : indiquez le prix du document.`,
    });
  });
  return issues;
}

export function collectExtractIssues(
  extract: {
    document_status?: string | null;
    items?: ExtractPriceItem[];
  },
  opts: { customerId?: string; requireCustomer?: boolean } = {}
): BookingIssue[] {
  const issues: BookingIssue[] = [];
  if (opts.requireCustomer && !String(opts.customerId || "").trim()) {
    issues.push({ field: "customer_id", message: "Choisissez un client." });
  }
  if (extract.document_status === "identity") {
    issues.push({
      field: "document_status",
      message: "Document d’identité : enregistrez-le dans le profil, pas en réservation.",
    });
  }
  (extract.items || []).forEach((item, index) => {
    if (!String(item.title || "").trim()) {
      issues.push({
        field: `items.${index}.title`,
        message: `Carte ${index + 1} : le titre est obligatoire.`,
      });
    }
  });
  issues.push(...documentPriceIssues(extract));
  return issues;
}

export function collectPublishIssues(items: { kind: string }[]): BookingIssue[] {
  if (items.some((item) => countsAsCarnetCard(item.kind))) {
    return [];
  }
  return [
    {
      field: "items",
      message: "Ajoutez au moins une carte (vol, hôtel, transfert…) avant de publier le carnet.",
    },
  ];
}
