import type { ZodError } from "zod";
import { travelerNeedsHousehold, type LinkedTraveler } from "./household";
import { isExtraItemKind } from "./types";

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
  if (!String(input.customerId || "").trim()) {
    issues.push({ field: "customer_id", message: "Choisissez un client." });
  } else if (input.customerFound === false) {
    issues.push({ field: "customer_id", message: "Client introuvable." });
  }
  if (!String(input.title || "").trim()) {
    issues.push({ field: "title", message: "Le titre du voyage est obligatoire." });
  }
  return issues;
}

export function collectExtractIssues(
  extract: {
    document_status?: string | null;
    items?: { title?: string | null; kind?: string | null }[];
    travelers?: LinkedTraveler[];
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
  (extract.travelers || []).forEach((traveler, index) => {
    if (!travelerNeedsHousehold(traveler)) return;
    const name = [traveler.first_name, traveler.last_name].filter(Boolean).join(" ").trim();
    issues.push({
      field: `travelers.${index}`,
      message: name
        ? `${name} n’est pas dans le foyer. Rattachez-le à un voyageur du compte, ou ajoutez-le d’abord sur la fiche client.`
        : `Voyageur ${index + 1} : rattachez une personne du foyer.`,
    });
  });
  return issues;
}

export function collectPublishIssues(items: { kind: string }[]): BookingIssue[] {
  if (items.some((item) => item.kind !== "fee" && !isExtraItemKind(item.kind))) {
    return [];
  }
  return [
    {
      field: "items",
      message: "Ajoutez au moins une carte (vol, hôtel, transfert…) avant de publier le carnet.",
    },
  ];
}
