/**
 * Un mail déjà lié à un dossier ne crée ni ne modifie de carte.
 * Ses pièces vont sur la carte qui correspond, ou sur le dossier.
 * Ordre : PNR, puis compagnie et trajet, puis fournisseur.
 */

export type EmailCardRef = {
  id: string;
  kind?: string | null;
  title?: string | null;
  supplier?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
};

export type EmailMention = {
  kind?: string | null;
  title?: string | null;
  supplier?: string | null;
  confirmation_ref?: string | null;
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

function pnrTokens(row: { confirmation_ref?: string | null; details?: Record<string, unknown> | null }) {
  const raw = `${row.confirmation_ref || ""} ${textDetail(row.details, "pnr")}`;
  return new Set(
    raw
      .split(/[^A-Za-z0-9]+/)
      .map(fold)
      .filter((token) => token.length >= 5)
  );
}

function sharesPnr(a: EmailCardRef, b: EmailCardRef) {
  const right = pnrTokens(b);
  for (const token of pnrTokens(a)) {
    if (right.has(token)) return true;
  }
  return false;
}

function airlineOf(row: EmailCardRef | EmailMention) {
  const iata = fold(textDetail(row.details, "airline_iata"));
  const name = fold(textDetail(row.details, "airline"));
  const number = fold(textDetail(row.details, "flight_number"));
  const prefix = number.replace(/[^A-Z]/g, "").slice(0, 2);
  return { iata: iata || prefix, name };
}

function airlinesMatch(a: EmailCardRef | EmailMention, b: EmailCardRef | EmailMention) {
  const left = airlineOf(a);
  const right = airlineOf(b);
  if (left.iata && right.iata && left.iata === right.iata) return true;
  if (left.name && right.name && (left.name === right.name || left.name.includes(right.name) || right.name.includes(left.name))) {
    return true;
  }
  if (left.iata && right.name.includes(left.iata)) return true;
  if (right.iata && left.name.includes(right.iata)) return true;
  return false;
}

function routeOf(row: EmailCardRef | EmailMention) {
  const from = fold(textDetail(row.details, "from"));
  const to = fold(textDetail(row.details, "to"));
  if (from.length !== 3 || to.length !== 3) return "";
  return `${from}-${to}`;
}

function suppliersMatch(card: EmailCardRef, mention: EmailMention) {
  const left = fold(card.supplier || textDetail(card.details, "airline"));
  const right = fold(mention.supplier || textDetail(mention.details, "airline"));
  if (left.length < 3 || right.length < 3) return false;
  return left === right || left.includes(right) || right.includes(left);
}

/** 3 PNR, 2 compagnie+trajet, 1 fournisseur, 0 rien. */
function rankCard(card: EmailCardRef, mentions: EmailMention[]) {
  let rank = 0;
  const cardPnr = pnrTokens(card);
  for (const mention of mentions) {
    for (const token of pnrTokens(mention)) {
      if (cardPnr.has(token)) rank = 3;
    }
    const route = routeOf(card);
    const mentionRoute = routeOf(mention);
    if (rank < 3 && route && route === mentionRoute && airlinesMatch(card, mention)) rank = 2;
    if (rank < 2 && suppliersMatch(card, mention)) rank = 1;
  }
  return rank;
}

function earliest(cards: EmailCardRef[]) {
  return [...cards].sort((a, b) => String(a.start_at || "").localeCompare(String(b.start_at || "")))[0];
}

function sameReservation(cards: EmailCardRef[]) {
  if (cards.length < 2) return true;
  return cards.every((card) => cards.every((other) => other === card || sharesPnr(card, other)));
}

/**
 * Carte qui reçoit les pièces. Null : elles restent sur le dossier.
 * Deux cartes du même PNR (aller et retour) : la plus tôt. Deux réservations à égalité : le dossier.
 */
export function matchEmailToCard(cards: EmailCardRef[], mentions: EmailMention[]): string | null {
  const live = cards.filter((card) => card.lifecycle !== "cancelled" && card.lifecycle !== "superseded");
  const scored = live
    .map((card) => ({ card, rank: rankCard(card, mentions) }))
    .filter((row) => row.rank > 0);
  if (!scored.length) return null;
  const best = Math.max(...scored.map((row) => row.rank));
  const hits = scored.filter((row) => row.rank === best).map((row) => row.card);
  if (hits.length === 1) return hits[0].id;
  if (best >= 2 && sameReservation(hits)) return earliest(hits).id;
  return null;
}
