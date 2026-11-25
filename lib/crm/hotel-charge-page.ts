/**
 * Lecture d’une page de paiement, sans navigateur.
 * Sert aux maquettes Stripe, Adyen et Worldpay, et au même contrôle que le cron.
 */

import { parseMoneyToCents } from "./hotel-arrival";
import { readChargePage, type ChargePageView } from "./hotel-auto";

const EURO = /(\d[\d\s.]*(?:[.,]\d{2})?)\s*(?:€|eur)|(?:€|eur)\s*(\d[\d\s.]*(?:[.,]\d{2})?)/gi;

export function checkoutAmount(text: string): { cents: number | null; currency: string | null } {
  const hits: number[] = [];
  for (const match of text.matchAll(EURO)) {
    const raw = match[1] || match[2] || "";
    const cents = parseMoneyToCents(raw);
    if (cents != null) hits.push(cents);
  }
  const unique = [...new Set(hits)];
  if (unique.length !== 1) return { cents: null, currency: unique.length ? "EUR" : null };
  return { cents: unique[0], currency: "EUR" };
}

export function checkoutHasCardFields(markup: string) {
  const autos = [...markup.matchAll(/autocomplete\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1].toLowerCase());
  const number = autos.includes("cc-number");
  const expiry = autos.includes("cc-exp") || autos.includes("cc-exp-month");
  const cvc = autos.includes("cc-csc");
  return number && expiry && cvc;
}

export function visibleCheckoutText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function readCheckoutHtml(html: string, url: string): ChargePageView {
  const text = visibleCheckoutText(html);
  const money = checkoutAmount(text);
  return readChargePage({
    url,
    text,
    amountCents: money.cents,
    currency: money.currency,
    hasCardFields: checkoutHasCardFields(html),
  });
}
