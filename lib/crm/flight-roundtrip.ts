import { flightCountsInStay, itemSellingAmount } from "@/lib/crm/bookings";
import { HIDDEN_PRICE_LABEL, itemPriceLabel } from "@/lib/crm/carnet";
import { formatMoney } from "@/lib/crm/money";
import type { CrmBookingItem } from "@/lib/crm/types";

/**
 * Aller-retour au même PNR (et au même fournisseur, s’il est indiqué) :
 * une carte à l’écran, deux lignes en base. Le prix du séjour ne change pas.
 */

type Leg = {
  id: string;
  kind?: string | null;
  title?: string | null;
  supplier?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
};

function fold(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function textDetail(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function pnrTokens(row: Leg) {
  const raw = `${row.confirmation_ref || ""} ${textDetail(row.details, "pnr")}`;
  return new Set(
    raw
      .split(/[^A-Za-z0-9]+/)
      .map(fold)
      .filter((token) => token.length >= 5)
  );
}

function sharesPnr(a: Leg, b: Leg) {
  const right = pnrTokens(b);
  for (const token of pnrTokens(a)) {
    if (right.has(token)) return true;
  }
  return false;
}

function routeOf(row: Leg) {
  const from = fold(textDetail(row.details, "from"));
  const to = fold(textDetail(row.details, "to"));
  if (from.length !== 3 || to.length !== 3) return "";
  return `${from}-${to}`;
}

function suppliersAgree(a: Leg, b: Leg) {
  const left = fold(a.supplier);
  const right = fold(b.supplier);
  if (!left || !right) return true;
  return left === right;
}

export type RoundTripPair<T> = { outbound: T; inbound: T };

/** Paires aller-retour. Le retour n’est pas une seconde carte à l’écran. */
export function roundTripPairs<T extends Leg>(items: T[]): RoundTripPair<T>[] {
  const flights = items.filter(
    (item) => (item.kind || "") === "flight" && item.lifecycle !== "cancelled" && item.lifecycle !== "superseded"
  );
  const used = new Set<string>();
  const pairs: RoundTripPair<T>[] = [];
  const ordered = [...flights].sort((a, b) => String(a.start_at || "").localeCompare(String(b.start_at || "")));
  for (const flight of ordered) {
    if (used.has(flight.id)) continue;
    if (!pnrTokens(flight).size) continue;
    const mates = ordered.filter((other) => {
      if (other.id === flight.id || used.has(other.id)) return false;
      if (!sharesPnr(flight, other) || !suppliersAgree(flight, other)) return false;
      const left = routeOf(flight);
      const right = routeOf(other);
      if (!left || !right) return false;
      const [af, at] = left.split("-");
      const [bf, bt] = right.split("-");
      return af === bt && at === bf;
    });
    if (mates.length !== 1) continue;
    used.add(flight.id);
    used.add(mates[0].id);
    const [outbound, inbound] = [flight, mates[0]].sort((a, b) =>
      String(a.start_at || "").localeCompare(String(b.start_at || ""))
    );
    pairs.push({ outbound, inbound });
  }
  return pairs;
}

export function roundTripReturnIds<T extends Leg>(items: T[]) {
  return new Set(roundTripPairs(items).map((pair) => pair.inbound.id));
}

export function roundTripMate<T extends Leg>(item: T, items: T[]): T | null {
  const pair = roundTripPairs(items).find((row) => row.outbound.id === item.id);
  return pair ? pair.inbound : null;
}

function dayLabel(iso: string | null | undefined) {
  const day = (iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Une ligne du vol : date, numéro, trajet. */
export function flightLegLine(item: Leg) {
  const number = textDetail(item.details, "flight_number");
  const cityFrom = textDetail(item.details, "city_from");
  const cityTo = textDetail(item.details, "city_to");
  const from = textDetail(item.details, "from");
  const to = textDetail(item.details, "to");
  const route = cityFrom && cityTo ? `${cityFrom} → ${cityTo}` : from && to ? `${from} → ${to}` : item.title || "";
  return [dayLabel(item.start_at), number, route].filter(Boolean).join(" · ");
}

/**
 * Prix affiché une fois. Même prix vendu : celui qui compte déjà dans le séjour.
 * Deux prix différents : leur somme, sans toucher aux lignes.
 */
export function roundTripPriceLabel(
  outbound: CrmBookingItem,
  inbound: CrmBookingItem | null,
  items: CrmBookingItem[],
  currency: string,
  pricesVisible = true
) {
  const outOn = flightCountsInStay(outbound, items);
  const inOn = inbound ? flightCountsInStay(inbound, items) : false;
  if (!outOn && !inOn) return null;
  if (!pricesVisible) return HIDDEN_PRICE_LABEL;
  if (outOn && inOn && inbound) {
    const sum = (itemSellingAmount(outbound) || 0) + (itemSellingAmount(inbound) || 0);
    return formatMoney(Math.round(sum * 100) / 100, currency);
  }
  const source = outOn ? outbound : inbound;
  return source ? itemPriceLabel(source, currency, null, true) : null;
}
