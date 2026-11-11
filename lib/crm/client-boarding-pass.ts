import { flightCities, flightNumber, itemClock } from "./carnet";
import { passengersFromDetails } from "./document-passengers";
import { greetingGivenName } from "./identity";
import { isBoardingPassDocument, passMatchesFlight } from "./online-checkin";
import { flightGate, flightTerminal } from "./flight-watch";
import type { BoardingPassPassenger } from "./boarding-pass-pdf";
import { isWalletPassName, storedWalletPass } from "./pkpass";
import type { CrmBookingItem } from "./types";

export type ClientBoardingCard = {
  key: string;
  documentId: string;
  /** Page 1-based. Null : le fichier n’a qu’une page, servi entier. */
  page: number | null;
  firstName: string;
  lastName?: string;
  flight: string;
  route: string;
  when: string;
  seat: string;
  terminal: string;
  gate: string;
  itemId: string | null;
  /** Lien déjà choisi (aperçu). Sinon l’espace client signe la page. */
  href?: string | null;
  /** Passe Apple Wallet déjà signé par la compagnie. */
  walletHref?: string | null;
  /** Pas de PDF : seulement le passe. */
  walletOnly?: boolean;
};

export type BoardingDocRef = {
  id: string;
  booking_item_id?: string | null;
  file_name?: string | null;
  kind?: string | null;
};

export type BoardingFlightRef = {
  id: string;
  kind?: string | null;
  title?: string | null;
  start_at?: string | null;
  details?: Record<string, unknown> | null;
  source_document_id?: string | null;
  visible_to_client?: boolean | null;
  lifecycle?: string | null;
  end_at?: string | null;
  supplier?: string | null;
};

function asItem(flight: BoardingFlightRef) {
  return flight as CrmBookingItem;
}

function compact(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function clientBoardingHref(documentId: string, page: number | null) {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return null;
  if (page == null) return `/api/mon-compte/cartes/${documentId}`;
  if (!Number.isInteger(page) || page < 1 || page > 40) return null;
  return `/api/mon-compte/cartes/${documentId}?page=${page}`;
}

/** PDF entier, y compris quand il contient plusieurs passagers. */
export function clientWalletHref(documentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return null;
  return `/api/mon-compte/cartes/${documentId}/passe.pkpass`;
}

export function clientBoardingFullHref(documentId: string) {
  const href = clientBoardingHref(documentId, null);
  return href ? `${href}?complet=1` : null;
}

export type BoardingFileLink = {
  documentId: string;
  href: string;
  label: string;
  itemIds: string[];
};

export type ClientBoardingOffer = {
  cards: ClientBoardingCard[];
  full: BoardingFileLink[];
};

function visibleFlights(flights: BoardingFlightRef[]) {
  return flights.filter(
    (flight) =>
      flight.kind === "flight" &&
      flight.visible_to_client !== false &&
      flight.lifecycle !== "cancelled" &&
      flight.lifecycle !== "superseded"
  );
}

function matchFlight(doc: BoardingDocRef, passengerFlight: string, flights: BoardingFlightRef[]) {
  const linked = doc.booking_item_id ? flights.find((flight) => flight.id === doc.booking_item_id) : null;
  if (linked) return linked;
  const code = compact(passengerFlight);
  const byNumber = flights.filter((flight) => {
    const number = compact(flightNumber(asItem(flight)));
    return number.length >= 4 && code.includes(number);
  });
  if (byNumber.length === 1) return byNumber[0];
  const byDoc = flights.filter((flight) => passMatchesFlight(doc, asItem(flight)));
  if (byDoc.length === 1) return byDoc[0];
  if (flights.length === 1) return flights[0];
  return null;
}

function clockLabel(flight: BoardingFlightRef | null) {
  if (!flight?.start_at) return "";
  const clock = itemClock(flight.start_at);
  return clock || "";
}

function cardFrom(
  doc: BoardingDocRef,
  flight: BoardingFlightRef | null,
  passenger: Partial<BoardingPassPassenger> | null,
  page: number | null
): ClientBoardingCard {
  const item = flight ? asItem(flight) : null;
  const firstName = passenger?.firstName || "";
  const seatFromFlight =
    item && typeof item.details?.seat === "string" && passengersFromDetails(item.details).length <= 1
      ? item.details.seat.trim()
      : "";
  return {
    key: `${doc.id}:${page ?? 0}:${firstName || "carte"}`,
    documentId: doc.id,
    page,
    firstName,
    lastName: passenger?.lastName || "",
    flight: passenger?.flight || (item ? flightNumber(item) : "") || "",
    route: passenger?.route || (item ? flightCities(item) : "") || "",
    when: passenger?.when || clockLabel(flight),
    seat: passenger?.seat || seatFromFlight,
    terminal: item ? flightTerminal(item) : "",
    gate: item ? flightGate(item) : "",
    itemId: flight?.id || null,
  };
}

/**
 * Une carte par page passager. Le bébé reste sur la page de l’adulte.
 * Sans lecture, une seule page peut s’ouvrir ; un PDF illisible à plusieurs pages n’est pas proposé en bloc.
 */
export function clientBoardingCards(input: {
  doc: BoardingDocRef;
  passengers: BoardingPassPassenger[];
  flights: BoardingFlightRef[];
  pageCount?: number;
}): ClientBoardingCard[] {
  if (!isBoardingPassDocument(input.doc)) return [];
  const flights = visibleFlights(input.flights);
  if (input.passengers.length) {
    return input.passengers.map((passenger) =>
      cardFrom(input.doc, matchFlight(input.doc, passenger.flight, flights) || null, passenger, passenger.page)
    );
  }
  if (input.pageCount !== 1) return [];
  const flight = matchFlight(input.doc, "", flights);
  const people = flight ? passengersFromDetails(asItem(flight).details) : [];
  const only = people.length === 1 ? people[0] : null;
  return [
    cardFrom(
      input.doc,
      flight,
      {
        firstName: greetingGivenName(only?.first_name) || "",
        lastName: "",
        flight: "",
        route: "",
        when: "",
        seat: "",
        page: 1,
      },
      1
    ),
  ];
}

export function cardsForFlight(cards: ClientBoardingCard[], itemIds: string[]) {
  const ids = new Set(itemIds);
  return cards.filter((card) => card.itemId && ids.has(card.itemId));
}

function flightsMatchingDoc(doc: BoardingDocRef, flights: BoardingFlightRef[]) {
  return visibleFlights(flights)
    .filter((flight) => passMatchesFlight(doc, asItem(flight)))
    .map((flight) => flight.id);
}

/** Cartes par passager, et le PDF entier quand il a plusieurs pages. */
export function boardingOfferForDocument(input: {
  doc: BoardingDocRef;
  passengers: BoardingPassPassenger[];
  flights: BoardingFlightRef[];
  pageCount?: number;
}): ClientBoardingOffer {
  if (!isBoardingPassDocument(input.doc)) return { cards: [], full: [] };
  const cards = clientBoardingCards(input);
  const pageCount = input.pageCount ?? 0;
  if (pageCount <= 1) return { cards, full: [] };
  const href = clientBoardingFullHref(input.doc.id);
  if (!href) return { cards, full: [] };
  const fromCards = [...new Set(cards.map((card) => card.itemId).filter((id): id is string => Boolean(id)))];
  const flight = cards.find((card) => card.flight)?.flight || "";
  return {
    cards,
    full: [
      {
        documentId: input.doc.id,
        href,
        label: cards.length ? (flight ? `PDF complet · ${flight}` : "PDF complet") : "Carte d’embarquement",
        itemIds: fromCards.length ? fromCards : flightsMatchingDoc(input.doc, input.flights),
      },
    ],
  };
}

export function mergeBoardingOffers(parts: ClientBoardingOffer[]): ClientBoardingOffer {
  return {
    cards: parts.flatMap((part) => part.cards),
    full: parts.flatMap((part) => part.full),
  };
}

/** Limite l’offre aux vols demandés. Sans vol, tout le séjour. */
export function scopeBoardingOffer(offer: ClientBoardingOffer, itemIds: string[]): ClientBoardingOffer {
  if (!itemIds.length) return offer;
  const ids = new Set(itemIds);
  return {
    cards: offer.cards.filter((card) => card.itemId && ids.has(card.itemId)),
    full: offer.full.filter((file) => file.itemIds.some((id) => ids.has(id))),
  };
}

export type ClientBoardingView = {
  cards: {
    key: string;
    firstName: string;
    flight: string;
    route: string;
    when: string;
    seat: string;
    href: string | null;
    walletHref: string | null;
  }[];
  full: { href: string; label: string }[];
};

function foldCard(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cardMatchesWallet(
  card: ClientBoardingCard,
  doc: BoardingDocRef,
  extract: ReturnType<typeof storedWalletPass>,
  flightId: string | null
) {
  if (card.walletOnly) return false;
  if (card.itemId && flightId && card.itemId !== flightId) return false;
  if (card.itemId && doc.booking_item_id && card.itemId !== doc.booking_item_id) return false;
  const flight = foldCard(extract?.flight || "");
  const cardFlight = foldCard(card.flight);
  if (flight && cardFlight && flight !== cardFlight) return false;
  const first = foldCard(extract?.firstName || "");
  const cardFirst = foldCard(card.firstName);
  if (first && cardFirst && first !== cardFirst) return false;
  if (!first && !cardFirst && !flight && !cardFlight && !flightId && !card.itemId) return false;
  return Boolean(first || cardFirst || flight || cardFlight || flightId || card.itemId);
}

/** Pose le bouton Apple Wallet sur la page du passager, ou ajoute une carte s’il n’y a pas de PDF. */
export function withWalletPasses(
  offer: ClientBoardingOffer,
  docs: (BoardingDocRef & { mime_type?: string | null; extracted?: unknown })[],
  flights: BoardingFlightRef[]
): ClientBoardingOffer {
  const cards = offer.cards.map((card) => ({ ...card }));
  const visible = visibleFlights(flights);
  for (const doc of docs) {
    if (!isWalletPassName(doc.file_name, doc.mime_type) || !isBoardingPassDocument(doc)) continue;
    const href = clientWalletHref(doc.id);
    if (!href) continue;
    const extract = storedWalletPass(doc.extracted);
    const linked = doc.booking_item_id ? visible.find((flight) => flight.id === doc.booking_item_id) || null : null;
    const byNumber = extract?.flight
      ? visible.filter((flight) => foldCard(flightNumber(asItem(flight))) === foldCard(extract.flight || ""))
      : [];
    const flight = linked || (byNumber.length === 1 ? byNumber[0] : null);
    const hits = cards.filter((card) => cardMatchesWallet(card, doc, extract, flight?.id || null));
    if (hits.length === 1) {
      hits[0].walletHref = href;
      continue;
    }
    if (hits.length > 1) continue;
    const onlyName = extract?.firstName || extract?.passenger || "";
    cards.push({
      ...cardFrom(
        doc,
        flight,
        {
          firstName: onlyName,
          lastName: extract?.lastName || "",
          flight: extract?.flight || "",
          route: extract?.route || "",
          when: "",
          seat: extract?.seat || "",
          page: 1,
        },
        null
      ),
      seat: extract?.seat || "",
      gate: extract?.gate || "",
      route: extract?.route || "",
      walletHref: href,
      walletOnly: true,
    });
  }
  return { cards, full: offer.full };
}

export function clientBoardingView(offer: ClientBoardingOffer): ClientBoardingView {
  return {
    cards: offer.cards.flatMap((card) => {
      const href = card.walletOnly ? null : card.href || clientBoardingHref(card.documentId, card.page);
      const walletHref = card.walletHref || null;
      if (!href && !walletHref) return [];
      return [
        {
          key: card.key,
          firstName: card.firstName,
          flight: card.flight,
          route: card.route,
          when: card.when,
          seat: card.seat,
          href,
          walletHref,
        },
      ];
    }),
    full: offer.full.map((file) => ({ href: file.href, label: file.label })),
  };
}
