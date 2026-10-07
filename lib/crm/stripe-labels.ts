import type { StripeInboxMethod } from "./stripe-inbox";
import { stripeMethodLabel } from "./stripe-inbox";

export const STRIPE_STATUS_LABELS: Record<string, string> = {
  unmatched: "À rapprocher",
  matched: "Rapproché",
  ignored: "Refusé",
};

export function stripeStatusLabel(status: string) {
  return STRIPE_STATUS_LABELS[status] ?? status;
}

export function stripeStatusTone(status: string): "amber" | "gold" | "navy" {
  if (status === "unmatched") return "amber";
  if (status === "matched") return "gold";
  return "navy";
}

export function stripeSyncSummary(fetched: number, inserted: number, autoMatched = 0) {
  const lus = fetched > 1 ? `${fetched} paiements lus` : `${fetched} paiement lu`;
  const nouveaux = inserted > 1 ? `${inserted} nouveaux` : `${inserted} nouveau`;
  const base = `Synchronisation terminée : ${lus}, ${nouveaux}`;
  if (autoMatched <= 0) return `${base}.`;
  const auto =
    autoMatched > 1 ? `${autoMatched} crédits automatiques` : `${autoMatched} crédit automatique`;
  return `${base}, ${auto}.`;
}

export function stripePossibleClientsLabel(count: number) {
  const plural = count > 1 ? "s" : "";
  return `${count} client${plural} possible${plural} — choisir`;
}

export function matchStripeReasonLabel(reason: string) {
  switch (reason) {
    case "metadata":
      return "Client du paiement";
    case "stripe_customer":
      return "Compte Stripe";
    case "email":
      return "E-mail";
    case "full_name":
      return "Nom complet";
    case "company_name":
      return "Société";
    default:
      return "Correspondance partielle";
  }
}

export function stripeInboxMethodCaption(method: StripeInboxMethod | null | undefined, last4?: string | null) {
  const label = stripeMethodLabel(method);
  return last4 ? `${label} ····${last4}` : label;
}
