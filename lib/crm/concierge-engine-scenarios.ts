import type { ConciergeScenario } from "@/lib/crm/concierge-sim";
import type { ScenarioExpect } from "@/lib/crm/concierge-grader";
import { SCENARIO_NOW } from "@/lib/crm/concierge-scenarios.fixture";
import { buildConciergeDossier, type ConciergeDossier } from "@/lib/crm/whatsapp-concierge";

export { SCENARIO_NOW };

const quiet = ["commission", "prix net", "fournisseur", "Little Emperors", "Booking", "Expedia"];

function held(extra: Partial<ScenarioExpect> = {}): ScenarioExpect {
  return { handoff: null, write: null, lang: "fr", access: false, mustNot: quiet, ...extra };
}

function rome(): ConciergeDossier {
  return buildConciergeDossier({
    firstName: "Camille",
    language: "fr",
    bookings: [
      {
        id: "stay-rome",
        reference: "TB-2026-8801",
        title: "Rome",
        destination: "Rome",
        start_date: "2026-12-04",
        end_date: "2026-12-08",
        currency: "EUR",
        total_amount: 0,
        visible_to_client: true,
        prices_visible: false,
        cover_image_path: null,
        notes_client: null,
        share_code: null,
      },
    ],
    items: [
      {
        id: "fl-out",
        booking_id: "stay-rome",
        kind: "flight",
        title: "Paris → Rome",
        start_at: "2026-12-04T10:30:00",
        end_at: "2026-12-04T12:40:00",
        amount: null,
        visible_to_client: true,
        supplier: "Air France",
        details: {
          flight_number: "AF1204",
          airline_iata: "AF",
          city_from: "Paris",
          city_to: "Rome",
          from: "CDG",
          to: "FCO",
          terminal: "2E",
          departure_timezone: "Europe/Paris",
        },
      },
    ],
    balances: [{ currency: "EUR", balance: -80 }],
  });
}

function mayakoba(): ConciergeDossier {
  return buildConciergeDossier({
    firstName: "Camille",
    language: "fr",
    bookings: [
      {
        id: "stay-maya",
        reference: "TB-2026-8810",
        title: "Mayakoba",
        destination: "Mayakoba",
        start_date: "2026-12-12",
        end_date: "2026-12-19",
        currency: "EUR",
        total_amount: 0,
        visible_to_client: true,
        prices_visible: false,
        cover_image_path: null,
        notes_client: null,
        share_code: null,
      },
    ],
    items: [
      {
        id: "fl-maya",
        booking_id: "stay-maya",
        kind: "flight",
        title: "Paris → Cancún",
        start_at: "2026-12-12T10:15:00",
        end_at: "2026-12-12T16:40:00",
        amount: null,
        visible_to_client: true,
        supplier: "Air France",
        details: {
          flight_number: "AF438",
          airline_iata: "AF",
          city_from: "Paris",
          city_to: "Cancún",
          from: "CDG",
          to: "CUN",
          departure_timezone: "Europe/Paris",
        },
      },
      {
        id: "htl-maya",
        booking_id: "stay-maya",
        kind: "hotel",
        title: "Rosewood Mayakoba",
        start_at: "2026-12-12T15:00:00",
        end_at: "2026-12-19T12:00:00",
        amount: null,
        visible_to_client: true,
        supplier: "Little Emperors",
        details: { hotel_name: "Rosewood Mayakoba", city: "Mayakoba" },
      },
    ],
    balances: [{ currency: "EUR", balance: 120 }],
  });
}

const romeDossier = rome();
const mayaDossier = mayakoba();

function scene(
  slug: string,
  phase: ConciergeScenario["phase"],
  title: string,
  fixture: ConciergeDossier,
  turns: ConciergeScenario["turns"],
  extra: Partial<ConciergeScenario> = {}
): ConciergeScenario {
  return { slug, phase, title, locale: "fr", fixture, published: true, turns, ...extra };
}

/** Cas tirés du fil réel, plus la recherche web. Le simulateur répond, rien n’est envoyé. */
export const CONCIERGE_ENGINE_SCENARIOS: ConciergeScenario[] = [
  scene("tarif-paris-nice", "avant_depart", "Un tarif n’est pas un avoir", romeDossier, [
    {
      position: 1,
      clientText: "avoir un tarif Paris Nice",
      expect: held({ handoff: "quote", tools: ["lire_vols", "ouvrir_demande"], mustNot: [...quiet, "solde", "80"] }),
    },
  ]),
  scene("heure-aeroport", "aeroport", "Heure d’arrivée à l’aéroport", romeDossier, [
    {
      position: 1,
      clientText: "à quelle heure à l'aéroport",
      expect: held({ tools: ["regles_aeroport", "lire_vols"] }),
    },
  ]),
  scene(
    "visa-cancun",
    "avant_depart",
    "Visa Cancún relié à Mayakoba",
    mayaDossier,
    [
      {
        position: 1,
        clientText: "visa pour Cancun",
        expect: held({ tools: ["lire_sejour", "formalites_pays"] }),
      },
    ],
    {
      travelers: [{ bookingId: "stay-maya", firstName: "Camille", lastName: "Martin" }],
    }
  ),
  scene(
    "check-in-agence",
    "vol",
    "L’agence fait le check-in",
    romeDossier,
    [
      {
        position: 1,
        clientText: "tu pourras me check-in",
        expect: held({
          handoff: "question",
          tools: ["statut_checkin", "ouvrir_demande"],
          mustNot: [...quiet, "compagnie"],
        }),
      },
    ],
    { checkins: [{ flightNumber: "AF1204", status: "a_faire" }] }
  ),
  scene(
    "chambre-tot-mexique",
    "hotel",
    "Chambre plus tôt après le Mexique",
    mayaDossier,
    [
      {
        position: 1,
        clientText: "On part bien à Cancún ?",
        expect: held({ tools: ["lire_sejour"] }),
      },
      {
        position: 2,
        clientText: "Je voudrais une chambre plus tôt",
        expect: held({ handoff: "question", tools: ["lire_sejour", "ouvrir_demande"] }),
      },
    ]
  ),
  scene("cest-une-question", "avant_depart", "Le client précise que c’est une question", romeDossier, [
    {
      position: 1,
      clientText: "avoir un tarif Paris Nice",
      expect: held({ handoff: "quote", tools: ["ouvrir_demande"], mustNot: [...quiet, "solde"] }),
    },
    {
      position: 2,
      clientText: "c'est une question",
      expect: held({ handoff: "quote", tools: ["ouvrir_demande"], mustNot: [...quiet, "solde"] }),
    },
  ]),
  scene("web-visa-mexique", "avant_depart", "Visa Mexique pour un Français", mayaDossier, [
    {
      position: 1,
      clientText: "Quel visa pour le Mexique avec un passeport français ?",
      expect: held({ tools: ["formalites_pays", "recherche_web"] }),
    },
  ]),
  scene("web-meteo-cancun", "sejour", "Météo à Cancún la semaine du séjour", mayaDossier, [
    {
      position: 1,
      clientText: "Quelle météo à Cancún la semaine du séjour ?",
      expect: held({ tools: ["recherche_web"] }),
    },
  ]),
  scene("web-retard-af", "vol", "Retard d’un vol AF", romeDossier, [
    {
      position: 1,
      clientText: "Il y a un retard sur mon vol AF ?",
      expect: held({ tools: ["lire_vols", "recherche_web"] }),
    },
  ]),
  scene("web-petit-dejeuner", "hotel", "Horaires du petit-déjeuner", mayaDossier, [
    {
      position: 1,
      clientText: "Quels sont les horaires du petit-déjeuner de l’hôtel ?",
      expect: held({ tools: ["recherche_web"] }),
    },
  ]),
  scene("web-greve", "aeroport", "Grève prévue", romeDossier, [
    {
      position: 1,
      clientText: "Il y a une grève prévue ?",
      expect: held({ handoff: "question", tools: ["recherche_web", "ouvrir_demande"] }),
    },
  ]),
];
