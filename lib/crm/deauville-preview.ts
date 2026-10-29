import type { ClientEveningTables } from "./client-tables";
import { presentClientTables, type ClientTableSource } from "./client-tables";
import {
  PLAT_CARD_BODY,
  SALLE_CARD_BODY,
  restaurantAcceptAck,
  restaurantCarouselDraft,
  restaurantGreeting,
  restaurantIntroText,
} from "./restaurant-whatsapp";
import { restaurantDefaultClock, type TableSeat, type TableStatus } from "./restaurants";

/** Aperçu local du séjour Boukris. Aucune ligne n’est écrite, aucun message ne part. */

const DRAKKAR = "a1111111-1111-4111-8111-111111111111";
const DEAUVILLE = "a2222222-2222-4222-8222-222222222222";
const PLANCHES = "a3333333-3333-4333-8333-333333333333";
const ESSENTIEL = "a4444444-4444-4444-8444-444444444444";

export const DEAUVILLE_STAY = {
  reference: "TB-2026-0089",
  client: "Benjamin Boukris",
  hotel: "You Hotel Deauville – Handwritten Collection",
  city: "Deauville",
  covers: 2,
};

export const DEAUVILLE_GREETING = restaurantGreeting({ sex: "M", lastName: "Boukris", firstName: "Benjamin" });

type House = {
  id: string;
  tableId: string;
  seat: TableSeat;
  name: string;
  address: string;
  pitch: string;
  price: string;
  href: string;
  salle: string;
  plat: string;
};

const FRIDAY: House[] = [
  {
    id: DRAKKAR,
    tableId: "b1111111-1111-4111-8111-111111111111",
    seat: "A",
    name: "Le Drakkar",
    address: "77 rue Eugène Colas",
    pitch:
      "L’adresse incontournable de Deauville, chère au monde hippique, où les poissons sont découpés devant vous et les crêpes Suzette flambées à votre table.",
    price: "50–90 €",
    href: "https://www.ledrakkar-deauville.fr/",
    salle: "/apercu/deauville/drakkar-salle.jpg",
    plat: "/apercu/deauville/drakkar-plat.jpg",
  },
  {
    id: DEAUVILLE,
    tableId: "b2222222-2222-4222-8222-222222222222",
    seat: "B",
    name: "Le Deauville",
    address: "3 quai Louis Bréguet",
    pitch: "Un décor signé Martin Brudnizki face à la marina, pour une soirée élégante et vivante.",
    price: "60–100 €",
    href: "https://www.restaurantledeauville.com/en/restaurant",
    salle: "/apercu/deauville/deauville-salle.jpg",
    plat: "/apercu/deauville/deauville-plat.jpg",
  },
];

const SATURDAY: House[] = [
  {
    id: PLANCHES,
    tableId: "b3333333-3333-4333-8333-333333333333",
    seat: "A",
    name: "Les Planches",
    address: "85 rue Eugène Colas",
    pitch: "Une table italienne chic et animée, idéale pour une soirée où l’on aime voir et être vu.",
    price: "50–90 €",
    href: "https://www.lesplanches-deauville.fr/en/",
    salle: "/apercu/deauville/planches-salle.jpg",
    plat: "/apercu/deauville/planches-plat.jpg",
  },
  {
    id: ESSENTIEL,
    tableId: "b4444444-4444-4444-8444-444444444444",
    seat: "B",
    name: "L’Essentiel",
    address: "29 rue Mirabeau",
    pitch: "Une étoile Michelin pour une cuisine où la Normandie dialogue avec la Corée, en toute délicatesse.",
    price: "90–150 €",
    href: "https://lessentieldeauville.com/",
    salle: "/apercu/deauville/essentiel-salle.jpg",
    plat: "/apercu/deauville/essentiel-plat.jpg",
  },
];

const EVENINGS: { date: string; houses: House[] }[] = [
  { date: "2026-10-30", houses: FRIDAY },
  { date: "2026-10-31", houses: SATURDAY },
];

function source(house: House, date: string, status: TableStatus, closed: boolean): ClientTableSource {
  return {
    id: house.tableId,
    date,
    seat: house.seat,
    time: "20:30",
    status,
    name: house.name,
    address: house.address,
    href: house.href,
    photo: house.salle,
    pitch: house.pitch,
    price: house.price,
    closed,
  };
}

export function deauvilleClientEvenings(mode: "proposees" | "choix"): ClientEveningTables[] {
  const rows: ClientTableSource[] = [];
  for (const evening of EVENINGS) {
    for (const house of evening.houses) {
      const chosen = mode === "choix" && evening.date === "2026-10-30";
      const status: TableStatus = !chosen ? "proposee" : house.seat === "A" ? "choisie" : "annulee";
      rows.push(source(house, evening.date, status, false));
    }
  }
  return presentClientTables(rows);
}

export type DeauvilleCard = { title: string; body: string; photo: string };

export type DeauvillePhoneBlock =
  | { kind: "text"; from: "agence" | "client"; text: string; time: string }
  | { kind: "carousel"; name: string; text: string; time: string; cards: DeauvilleCard[]; pressed: boolean };

export type DeauvillePhone = { id: string; caption: string; blocks: DeauvillePhoneBlock[] };

function cardsFor(house: House): { text: string; cards: DeauvilleCard[] } | { error: string } {
  const draft = restaurantCarouselDraft({
    greeting: DEAUVILLE_GREETING,
    restaurantName: house.name,
    timeLabel: restaurantDefaultClock(),
    pitch: house.pitch,
    priceBand: house.price,
    restaurantId: house.id,
    tableId: house.tableId,
    menuPhoto: false,
  });
  if ("error" in draft) return draft;
  return {
    text: draft.text,
    cards: [
      {
        title: "La salle",
        body: SALLE_CARD_BODY.replace("{{4}}", draft.variables["4"]).replace("{{6}}", draft.variables["6"]),
        photo: house.salle,
      },
      {
        title: "Le plat signature",
        body: PLAT_CARD_BODY.replace("{{8}}", draft.variables["8"]),
        photo: house.plat,
      },
    ],
  };
}

function eveningThread(date: string, houses: House[], time: string): DeauvillePhoneBlock[] {
  const blocks: DeauvillePhoneBlock[] = [
    { kind: "text", from: "agence", time, text: restaurantIntroText({ greeting: DEAUVILLE_GREETING, eveningDate: date }) },
  ];
  houses.forEach((house, index) => {
    const cards = cardsFor(house);
    if ("error" in cards) return;
    const minute = String(2 + index).padStart(2, "0");
    blocks.push({
      kind: "carousel",
      name: house.name,
      text: cards.text,
      time: time.replace(/:\d{2}$/, `:${minute}`),
      cards: cards.cards,
      pressed: false,
    });
  });
  return blocks;
}

export function deauvillePhones(): DeauvillePhone[] {
  const friday = cardsFor(FRIDAY[0]);
  const ack = restaurantAcceptAck({
    greeting: DEAUVILLE_GREETING,
    restaurant: "Le Drakkar",
    eveningDate: "2026-10-30",
    timeLabel: restaurantDefaultClock(),
    other: "Le Deauville",
  });
  const accept: DeauvillePhoneBlock[] = [];
  if (!("error" in friday)) {
    accept.push({
      kind: "carousel",
      name: "Le Drakkar",
      text: friday.text,
      time: "16:02",
      cards: friday.cards,
      pressed: true,
    });
  }
  accept.push(
    { kind: "text", from: "client", time: "17:12", text: "J’accepte" },
    { kind: "text", from: "agence", time: "17:12", text: ack }
  );
  return [
    { id: "vendredi", caption: "Vendredi 30 octobre · pré-message puis les deux tables", blocks: eveningThread("2026-10-30", FRIDAY, "16:00") },
    { id: "samedi", caption: "Samedi 31 octobre · pré-message puis les deux tables", blocks: eveningThread("2026-10-31", SATURDAY, "16:00") },
    { id: "accepte", caption: "Clic J’accepte · Le Drakkar, l’autre table est à annuler", blocks: accept },
  ];
}

export function deauvilleCarouselErrors() {
  return [...FRIDAY, ...SATURDAY].flatMap((house) => {
    const cards = cardsFor(house);
    return "error" in cards ? [`${house.name}: ${cards.error}`] : [];
  });
}

export function deauvilleHouses() {
  return EVENINGS.map((evening) => ({
    date: evening.date,
    intro: restaurantIntroText({ greeting: DEAUVILLE_GREETING, eveningDate: evening.date }),
    houses: evening.houses.map((house) => {
      const cards = cardsFor(house);
      return {
        house,
        text: "error" in cards ? "" : cards.text,
        cards: "error" in cards ? [] : cards.cards,
      };
    }),
  }));
}
