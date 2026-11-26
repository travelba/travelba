import { buildConciergeDossier, type ConciergeDossier } from "@/lib/crm/whatsapp-concierge";
import type { ConciergeScenario } from "@/lib/crm/concierge-sim";
import type { ScenarioExpect } from "@/lib/crm/concierge-grader";

/** Jeudi 20 novembre 2026, 09:00 à Paris. Le vol fictif est encore à venir. */
export const SCENARIO_NOW = new Date("2026-11-20T08:00:00.000Z");

const QUIET = ["Air France", "Little Emperors", "NE-PAS-CITER", "passeport", "MRZ"];

function dossier(): ConciergeDossier {
  return buildConciergeDossier({
    firstName: "Camille",
    language: "fr",
    preferences: ["petit-déjeuner"],
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
        notes_client: "Chambre calme si possible",
        notes_internal: "NE-PAS-CITER",
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
          airline: "Air France",
          airline_iata: "AF",
          city_from: "Paris",
          city_to: "Rome",
          from: "CDG",
          to: "FCO",
          terminal: "2E",
        },
      },
      {
        id: "htl",
        booking_id: "stay-rome",
        kind: "hotel",
        title: "Hotel de Test",
        start_at: "2026-12-04T15:00:00",
        end_at: "2026-12-08T11:00:00",
        amount: null,
        visible_to_client: true,
        supplier: "Little Emperors",
        details: {
          hotel_name: "Hotel de Test",
          city: "Rome",
          board: "petit-déjeuner",
        },
      },
      {
        id: "fl-back",
        booking_id: "stay-rome",
        kind: "flight",
        title: "Rome → Paris",
        start_at: "2026-12-08T18:15:00",
        end_at: "2026-12-08T20:25:00",
        amount: null,
        visible_to_client: true,
        supplier: "Air France",
        details: {
          flight_number: "AF1205",
          airline: "Air France",
          airline_iata: "AF",
          city_from: "Rome",
          city_to: "Paris",
          from: "FCO",
          to: "CDG",
          terminal: "1",
        },
      },
    ],
    balances: [{ currency: "EUR", balance: -80 }],
    authorizations: [
      {
        bookingId: "stay-rome",
        travelerId: "trav-camille",
        traveler: "Camille Martin",
        kind: "esta",
        status: "approuve",
        validUntil: "2027-06-01",
        checkedAt: "2026-11-01",
      },
    ],
  });
}

const shared = dossier();

function scenario(
  slug: string,
  phase: ConciergeScenario["phase"],
  title: string,
  turns: ConciergeScenario["turns"]
): ConciergeScenario {
  return { slug, phase, title, locale: "fr", fixture: shared, published: true, turns };
}

const held: ScenarioExpect = {
  handoff: null,
  write: null,
  lang: "fr",
  mustNot: QUIET,
  access: false,
};

/** Un scénario par phase. Le routeur répond. Le dernier tour de l’avant-départ attend le modèle. */
export const CONCIERGE_SCENARIOS: ConciergeScenario[] = [
  scenario("avant-depart-vol", "avant_depart", "Horaire du vol avant le départ", [
    { position: 1, clientText: "À quelle heure est mon vol ?", expect: { ...held, tools: [] } },
    { position: 2, clientText: "Où en est mon ESTA ?", expect: { ...held, tools: ["lire_autorisation"] } },
    {
      position: 3,
      clientText: "Vous êtes adorable, merci pour tout",
      expect: { ...held, needsModel: true },
    },
  ]),
  scenario("aeroport-horaire", "aeroport", "Heure de décollage à l’aéroport", [
    { position: 1, clientText: "À l’aéroport, à quelle heure décolle mon vol ?", expect: held },
  ]),
  scenario("vol-numero", "vol", "Numéro du prochain vol", [
    { position: 1, clientText: "Quel est mon vol ?", expect: held },
  ]),
  scenario("arrivee-heure", "arrivee", "Heure d’arrivée à Rome", [
    { position: 1, clientText: "À quelle heure j’arrive à Rome ?", expect: held },
  ]),
  scenario("hotel-nom", "hotel", "Nom de l’hôtel", [
    { position: 1, clientText: "Quel est mon hôtel ?", expect: held },
  ]),
  scenario("sejour-lieu", "sejour", "Séjour déjà commencé à l’hôtel", [
    { position: 1, clientText: "Je suis arrivé à l’hôtel", expect: held },
  ]),
  scenario("retour-heure", "retour", "Heure du vol de retour", [
    { position: 1, clientText: "À quelle heure est le retour ?", expect: { ...held, mustNot: [...QUIET, "AF1204"] } },
  ]),
  scenario("ecriture-telephone", "ecriture", "Téléphone ajouté sur la fiche", [
    {
      position: 1,
      clientText: "Ajoutez mon téléphone 06 12 34 56 78",
      expect: { ...held, write: { action: "contact", champs: ["telephone"] } },
    },
  ]),
  scenario("refus-checkin", "refus", "Le check-in n’est pas fait dans le fil", [
    { position: 1, clientText: "Faites mon check-in", expect: { ...held, handoff: "question" } },
  ]),
];

const quiet = (extra: string[] = []): ScenarioExpect => ({
  ...held,
  mustNot: [...QUIET, ...extra],
});

/** Les six écarts, plus le terminal. Ils doivent passer. */
export const CONCIERGE_EDGES: ConciergeScenario[] = [
  scenario("annulation-courte", "refus", "Annulation en trois lignes", [
    { position: 1, clientText: "Annulez mon séjour s’il vous plaît", expect: { ...held, handoff: "cancel" } },
  ]),
  scenario("petit-dejeuner", "sejour", "Petit-déjeuner en phrase", [
    { position: 1, clientText: "Le petit-déjeuner est inclus ?", expect: quiet(["—", "TB-"]) },
  ]),
  scenario("retour-mal-formule", "retour", "Mon retour est à quelle heure", [
    { position: 1, clientText: "Mon retour est à quelle heure ?", expect: quiet(["AF1204"]) },
  ]),
  scenario("payer-hotel", "refus", "Paiement de l’hôtel refusé dans le fil", [
    {
      position: 1,
      clientText: "Payez l’hôtel pour moi",
      expect: { ...quiet(["Hotel de Test", "décembre"]), handoff: "payment" },
    },
  ]),
  scenario("ecrire-hotel", "refus", "Message à l’hôtel refusé dans le fil", [
    {
      position: 1,
      clientText: "Envoyez le message à l’hôtel",
      expect: { ...quiet(["Hotel de Test", "décembre"]), handoff: "question" },
    },
  ]),
  scenario("retirer-carte", "ecriture", "Retrait de carte bancaire", [
    {
      position: 1,
      clientText: "Retirez la carte bancaire 4242",
      expect: { ...held, write: { action: "retirer_carte", champs: ["retirer_carte_paiement"] } },
    },
  ]),
  scenario("terminal-vol", "aeroport", "Terminal du prochain vol", [
    { position: 1, clientText: "Quel est le terminal de mon vol ?", expect: held },
  ]),
];

/** Formulations voisines, en français et en anglais. */
export const CONCIERGE_NEARBY: ConciergeScenario[] = [
  scenario("annulation-en", "refus", "Cancel my stay", [
    {
      position: 1,
      clientText: "Please cancel my stay",
      expect: { ...held, lang: "en", handoff: "cancel" },
    },
  ]),
  scenario("annulation-voisine", "refus", "Annulez le séjour", [
    { position: 1, clientText: "Annulez le séjour, s’il vous plaît", expect: { ...held, handoff: "cancel" } },
  ]),
  scenario("petit-dejeuner-en", "sejour", "Breakfast included", [
    {
      position: 1,
      clientText: "Is breakfast included at the hotel?",
      expect: { ...quiet(["—", "TB-"]), lang: "en" },
    },
  ]),
  scenario("petit-dejeuner-voisin", "sejour", "Petit déjeuner compris", [
    { position: 1, clientText: "Le petit déjeuner est-il compris ?", expect: quiet(["—", "TB-"]) },
  ]),
  scenario("retour-en", "retour", "What time is my return", [
    {
      position: 1,
      clientText: "What time is my return?",
      expect: { ...quiet(["AF1204"]), lang: "en" },
    },
  ]),
  scenario("retour-vol", "retour", "Vol de retour", [
    { position: 1, clientText: "À quelle heure est mon vol de retour ?", expect: quiet(["AF1204"]) },
  ]),
  scenario("payer-en", "refus", "Pay the hotel", [
    {
      position: 1,
      clientText: "Can you pay the hotel?",
      expect: { ...quiet(["Hotel de Test", "décembre"]), lang: "en", handoff: "payment" },
    },
  ]),
  scenario("payer-voisin", "refus", "Réglez l’hôtel", [
    {
      position: 1,
      clientText: "Réglez l’hôtel s’il vous plaît",
      expect: { ...quiet(["Hotel de Test", "décembre"]), handoff: "payment" },
    },
  ]),
  scenario("ecrire-en", "refus", "Send this to the hotel", [
    {
      position: 1,
      clientText: "Please send this to the hotel",
      expect: { ...quiet(["Hotel de Test", "décembre"]), lang: "en", handoff: "question" },
    },
  ]),
  scenario("ecrire-voisin", "refus", "Écrivez à l’hôtel", [
    {
      position: 1,
      clientText: "Écrivez à l’hôtel pour moi",
      expect: { ...quiet(["Hotel de Test", "décembre"]), handoff: "question" },
    },
  ]),
  scenario("retirer-en", "ecriture", "Remove my card", [
    {
      position: 1,
      clientText: "Remove my card 4242",
      expect: { ...held, lang: "en", write: { action: "retirer_carte", champs: ["retirer_carte_paiement"] } },
    },
  ]),
  scenario("retirer-voisin", "ecriture", "Supprimez ma carte", [
    {
      position: 1,
      clientText: "Supprimez ma carte bancaire",
      expect: { ...held, write: { action: "retirer_carte", champs: ["retirer_carte_paiement"] } },
    },
  ]),
  scenario("terminal-en", "aeroport", "Flight terminal", [
    { position: 1, clientText: "What is my flight terminal?", expect: { ...held, lang: "en" } },
  ]),
  scenario("terminal-voisin", "aeroport", "Terminal du retour", [
    { position: 1, clientText: "À quel terminal est le vol de retour ?", expect: held },
  ]),
];

/** Lignes prêtes pour un upsert ultérieur. Ce module n’écrit rien. */
export function scenarioRecords(scenarios: ConciergeScenario[] = CONCIERGE_SCENARIOS) {
  return scenarios.map((row) => ({
    slug: row.slug,
    phase: row.phase,
    title: row.title,
    locale: row.locale,
    published: row.published,
    fixture: row.fixture,
    turns: row.turns.map((turn) => ({
      position: turn.position,
      client_text: turn.clientText,
      expect: turn.expect,
    })),
  }));
}
