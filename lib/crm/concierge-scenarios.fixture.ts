import { buildConciergeDossier, type ConciergeDossier } from "@/lib/crm/whatsapp-concierge";
import type { ConciergeScenario } from "@/lib/crm/concierge-sim";
import type { GradeCriterion, ScenarioExpect } from "@/lib/crm/concierge-grader";

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

export type KnownGap = {
  scenario: ConciergeScenario;
  criterion: GradeCriterion;
  why: string;
};

/**
 * Écarts du concierge actuel. L’attendu est le comportement juste.
 * Le simulateur les note en échec, pour une raison stable.
 */
export const CONCIERGE_GAPS: KnownGap[] = [
  {
    criterion: "longueur",
    why: "L’annulation nomme le séjour et le lien : quatre lignes, au-dessus du plafond du modèle.",
    scenario: scenario("ecart-annulation-longue", "refus", "Annulation trop longue", [
      { position: 1, clientText: "Annulez mon séjour s’il vous plaît", expect: { ...held, handoff: "cancel" } },
    ]),
  },
  {
    criterion: "robot",
    why: "Le petit-déjeuner inclus est rendu comme une fiche, avec un tiret long.",
    scenario: scenario("ecart-petit-dejeuner", "sejour", "Petit-déjeuner inclus", [
      { position: 1, clientText: "Le petit-déjeuner est inclus ?", expect: held },
    ]),
  },
  {
    criterion: "interdit",
    why: "« Mon retour est à quelle heure » cite le vol aller AF1204, pas le retour.",
    scenario: scenario("ecart-retour-mal-lu", "retour", "Retour mal lu", [
      {
        position: 1,
        clientText: "Mon retour est à quelle heure ?",
        expect: { ...held, mustNot: [...QUIET, "AF1204"] },
      },
    ]),
  },
  {
    criterion: "handoff",
    why: "« Payez l’hôtel » ne passe pas la main : le routeur décrit le séjour.",
    scenario: scenario("ecart-payer-hotel", "refus", "Paiement demandé dans le fil", [
      { position: 1, clientText: "Payez l’hôtel pour moi", expect: { ...held, handoff: "payment" } },
    ]),
  },
  {
    criterion: "handoff",
    why: "« Envoyez le message à l’hôtel » ne passe pas la main.",
    scenario: scenario("ecart-envoi-hotel", "refus", "Envoi à l’hôtel", [
      { position: 1, clientText: "Envoyez le message à l’hôtel", expect: { ...held, handoff: "question" } },
    ]),
  },
  {
    criterion: "ecriture",
    why: "« Retirez la carte bancaire » est classé comme un enregistrement de carte.",
    scenario: scenario("ecart-retirer-carte", "ecriture", "Retrait de carte", [
      {
        position: 1,
        clientText: "Retirez la carte bancaire 4242",
        expect: { ...held, write: { action: "retirer_carte", champs: ["retirer_carte_paiement"] } },
      },
    ]),
  },
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
