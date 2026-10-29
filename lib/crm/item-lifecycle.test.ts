import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeCardDateRange,
  cancellationApplyPlan,
  cardStaysShown,
  inboxStayAction,
  hollowHotelCard,
  replacementPlan,
  stayDatesFromExtract,
} from "./item-lifecycle";

const hotel = (patch: Record<string, unknown> = {}) => ({
  id: "h1",
  kind: "hotel",
  title: "Hotel Eden",
  confirmation_ref: "97620170",
  amount: 1200,
  include_in_ledger: false,
  ...patch,
});

describe("replacementPlan", () => {
  it("met à jour la carte quand la référence est la même, et garde le prix pour la suite", () => {
    const plan = replacementPlan(
      [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620170" }],
      [hotel()]
    );
    assert.deepEqual(plan.updates, [{ itemId: "h1" }]);
    assert.deepEqual(plan.replacements, []);
    assert.equal(plan.choices.length, 0);
  });

  it("met à jour l’hôtel sans référence quand le nom et les nuits sont les mêmes", () => {
    const plan = replacementPlan(
      [
        {
          kind: "hotel",
          title: "Mondrian Bordeaux",
          confirmation_ref: "B7G5AJC0552",
          start_at: "2026-10-13",
          end_at: "2026-10-14",
        },
      ],
      [
        hotel({
          title: "Mondrian Bordeaux Les Carmes",
          confirmation_ref: null,
          start_at: "2026-10-13",
          end_at: "2026-10-14",
        }),
      ]
    );
    assert.deepEqual(plan.updates, [{ itemId: "h1" }]);
    assert.deepEqual(plan.replacements, []);
    assert.equal(plan.adds, 0);
  });

  it("met à jour la carte quand l’hôtel et les dates sont les mêmes, même si le numéro change", () => {
    const plan = replacementPlan(
      [
        {
          kind: "hotel",
          title: "Nobu Hotel London Portman Square",
          confirmation_ref: "LECONF88",
          start_at: "2026-11-02",
          end_at: "2026-11-05",
          details: { hotel_name: "Nobu Hotel London Portman Square" },
        },
      ],
      [
        hotel({
          title: "Nobu Hotel London Portman Square",
          confirmation_ref: "HTL99881",
          start_at: "2026-11-02",
          end_at: "2026-11-05",
          details: { hotel_name: "Nobu Hotel London Portman Square" },
        }),
      ]
    );
    assert.deepEqual(plan.updates, [{ itemId: "h1" }]);
    assert.equal(plan.replacements.length, 0);
    assert.equal(plan.adds, 0);
    assert.equal(plan.choices.length, 0);
  });

  it("ne choisit pas entre deux cartes du même hôtel aux mêmes dates", () => {
    const incoming = [
      {
        kind: "hotel",
        title: "NoMad London",
        confirmation_ref: "HTLNEW11111",
        start_at: "2026-10-30",
        end_at: "2026-11-03",
        details: { hotel_name: "NoMad London" },
      },
    ];
    const plan = replacementPlan(incoming, [
      hotel({
        title: "NoMad London",
        confirmation_ref: "3104088572",
        start_at: "2026-10-30",
        end_at: "2026-11-03",
        details: { hotel_name: "NoMad London" },
      }),
      hotel({
        id: "h2",
        title: "NoMad London",
        confirmation_ref: "3105358205",
        start_at: "2026-10-30",
        end_at: "2026-11-03",
        details: { hotel_name: "NoMad London" },
      }),
    ]);
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.replacements.length, 0);
    assert.equal(plan.adds, 0);
    assert.deepEqual(
      plan.choices.map((row) => row.id),
      ["h1", "h2"]
    );
  });

  it("remplace l’unique hôtel quand la référence change, au prix vendu", () => {
    const plan = replacementPlan(
      [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620171" }],
      [hotel()]
    );
    assert.equal(plan.replacements.length, 1);
    assert.equal(plan.replacements[0].itemId, "h1");
    assert.equal(plan.replacements[0].amount, 1200);
  });

  it("demande la carte s’il y a deux hôtels du même séjour", () => {
    const plan = replacementPlan(
      [{ kind: "hotel", title: "Autre hôtel", confirmation_ref: "97620199", start_at: "2026-06-01", end_at: "2026-06-04" }],
      [
        hotel({ start_at: "2026-06-01", end_at: "2026-06-04" }),
        hotel({ id: "h2", title: "Second", confirmation_ref: "97620188", amount: 800, start_at: "2026-06-02", end_at: "2026-06-05" }),
      ]
    );
    assert.equal(plan.replacements.length, 0);
    assert.equal(plan.adds, 0);
    assert.deepEqual(
      plan.choices.map((row) => row.id),
      ["h1", "h2"]
    );
    const chosen = replacementPlan(
      [{ kind: "hotel", title: "Autre hôtel", confirmation_ref: "97620199", start_at: "2026-06-01", end_at: "2026-06-04" }],
      [
        hotel({ start_at: "2026-06-01", end_at: "2026-06-04" }),
        hotel({ id: "h2", title: "Second", confirmation_ref: "97620188", amount: 800, start_at: "2026-06-02", end_at: "2026-06-05" }),
      ],
      "h2"
    );
    assert.equal(chosen.replacements[0].itemId, "h2");
    assert.equal(chosen.replacements[0].amount, 800);
  });

  it("ajoute l’hôtel suivant : le jour de départ ne compte pas", () => {
    const plan = replacementPlan(
      [
        {
          kind: "hotel",
          title: "Crowne Plaza Changi Airport",
          confirmation_ref: "73564866232664",
          start_at: "2026-11-16",
          end_at: "2026-11-19",
        },
      ],
      [
        hotel({
          id: "fairmont",
          title: "Fairmont Singapore",
          confirmation_ref: "470705216",
          amount: 1361,
          start_at: "2026-11-19",
          end_at: "2026-11-22",
        }),
      ]
    );
    assert.equal(plan.replacements.length, 0);
    assert.equal(plan.choices.length, 0);
    assert.equal(plan.adds, 1);
  });

  it("remplace l’hôtel du même séjour quand le nom change", () => {
    const plan = replacementPlan(
      [
        {
          kind: "hotel",
          title: "Autre hôtel",
          confirmation_ref: "97620171",
          start_at: "2026-06-01",
          end_at: "2026-06-04",
        },
      ],
      [hotel({ start_at: "2026-06-01", end_at: "2026-06-04", amount: 1200 })]
    );
    assert.equal(plan.replacements.length, 1);
    assert.equal(plan.replacements[0].itemId, "h1");
    assert.equal(plan.replacements[0].amount, 1200);
  });

  it("met à jour la réservation Little Emperors et ajoute le trajet manquant", () => {
    const items = [
      hotel({ id: "milan", title: "Four Seasons Hotel Milan", confirmation_ref: "64570SH046795" }),
      hotel({
        id: "old",
        title: "Four Seasons Hotel Milano",
        confirmation_ref: "64570SH046734",
        lifecycle: "cancelled",
      }),
      hotel({ id: "rome", title: "Casa Monti", confirmation_ref: "45609SH011085" }),
      { id: "rail", kind: "rail", title: "Milano · Roma", confirmation_ref: "FEFZ75" },
    ];
    const incoming = [
      { kind: "hotel", title: "Hotel Milan", confirmation_ref: "64570SH046734" },
      { kind: "hotel", title: "Four Seasons Hotel Milan", confirmation_ref: "64570" },
      { kind: "hotel", title: "Hotel Rome", confirmation_ref: "45609SH010994" },
      { kind: "hotel", title: "Casa Monti", confirmation_ref: "45609" },
      { kind: "rail", title: "Milano · Roma", confirmation_ref: "FEFZ75" },
      { kind: "transfer", title: "Milan Rome", confirmation_ref: "TR-1" },
    ];
    const plan = replacementPlan(incoming, items);
    assert.deepEqual(
      plan.updates.map((row) => row.itemId).sort(),
      ["milan", "rail", "rome"]
    );
    assert.equal(plan.replacements.length, 0);
    assert.equal(plan.choices.length, 0);
    assert.equal(plan.adds, 1);
    const gesture = inboxStayAction({
      documentStatus: "confirmed",
      incoming,
      bookingStatus: "confirmed",
      items,
    });
    assert.equal(gesture.label, "Mettre à jour le séjour");
    assert.equal(gesture.action, "attach");
    assert.equal(gesture.choices.length, 0);
  });

  it("demande la chambre quand deux cartes actives partagent la réservation", () => {
    const plan = replacementPlan(
      [{ kind: "hotel", title: "Four Seasons", confirmation_ref: "64570" }],
      [
        hotel({ id: "a", confirmation_ref: "64570SH046734" }),
        hotel({ id: "b", confirmation_ref: "64570SH046795" }),
      ]
    );
    assert.deepEqual(
      plan.choices.map((row) => row.id),
      ["a", "b"]
    );
  });

  it("ajoute le second segment d’un billet au lieu de demander quelle carte remplacer", () => {
    const existing = [
      {
        id: "ly",
        kind: "flight",
        title: "Paris → Tel Aviv",
        confirmation_ref: "X8YYVJ",
        start_at: "2027-08-04T12:40:00",
        details: { flight_number: "LY 222" },
      },
      {
        id: "iz",
        kind: "flight",
        title: "Tel Aviv → Seychelles",
        confirmation_ref: "X972RT",
        start_at: "2027-08-11T07:30:00",
        details: { flight_number: "IZ611" },
      },
      {
        id: "ek",
        kind: "flight",
        title: "Seychelles → Paris via Dubaï",
        confirmation_ref: "X97UJQ",
        start_at: "2027-08-25T08:25:00",
        end_at: "2027-08-25T20:00:00",
        details: { flight_number: "EK706" },
      },
    ];
    const incoming = [
      {
        kind: "flight",
        title: "Emirates - EK 706",
        confirmation_ref: "X97UJQ",
        start_at: "2027-08-25T08:25:00",
        end_at: "2027-08-25T12:55:00",
        details: { flight_number: "EK 706" },
      },
      {
        kind: "flight",
        title: "Emirates - EK 75",
        confirmation_ref: "X97UJQ",
        start_at: "2027-08-25T14:40:00",
        end_at: "2027-08-25T20:00:00",
        details: { flight_number: "EK 75" },
      },
    ];
    const plan = replacementPlan(incoming, existing);
    assert.deepEqual(plan.updates, [{ itemId: "ek" }]);
    assert.equal(plan.adds, 1);
    assert.equal(plan.replacements.length, 0);
    assert.equal(plan.choices.length, 0);
    const gesture = inboxStayAction({
      documentStatus: "confirmed",
      incoming,
      bookingStatus: "quoted",
      items: existing,
    });
    assert.equal(gesture.action, "attach");
    assert.equal(gesture.choices.length, 0);
    assert.equal(gesture.label, "Mettre à jour le séjour");
  });

  it("ajoute un vol isolé même s’il reste d’autres vols, sauf si une carte est choisie", () => {
    const existing = [
      {
        id: "old",
        kind: "flight",
        title: "Aller",
        confirmation_ref: "OLD111",
        start_at: "2027-08-04T12:40:00",
        details: { flight_number: "LY222" },
      },
    ];
    const incoming = [
      {
        kind: "flight",
        title: "Retour",
        confirmation_ref: "NEW111",
        start_at: "2027-08-25T14:40:00",
        details: { flight_number: "EK75" },
      },
    ];
    const plan = replacementPlan(incoming, existing);
    assert.equal(plan.adds, 1);
    assert.equal(plan.replacements.length, 0);
    assert.equal(plan.choices.length, 0);
    const chosen = replacementPlan(incoming, existing, "old");
    assert.equal(chosen.replacements[0]?.itemId, "old");
    assert.equal(chosen.adds, 0);
  });

  it("ajoute plusieurs hôtels nouveaux sans demander une carte", () => {
    const plan = replacementPlan(
      [
        { kind: "hotel", title: "Un", confirmation_ref: "11111SH000001" },
        { kind: "hotel", title: "Deux", confirmation_ref: "22222SH000002" },
      ],
      [hotel(), hotel({ id: "h2", confirmation_ref: "97620188" })]
    );
    assert.equal(plan.choices.length, 0);
    assert.equal(plan.adds, 2);
    assert.equal(plan.replacements.length, 0);
  });

  it("ignore un hôtel sans date ni numéro, et ne retire pas l’autre hôtel", () => {
    const plan = replacementPlan(
      [
        {
          kind: "hotel",
          title: "Fairmont Singapore",
          confirmation_ref: "470705216",
          start_at: "2026-11-19",
          end_at: "2026-11-22",
        },
        { kind: "hotel", title: "Fairmont Singapore" },
      ],
      [
        hotel({
          id: "fairmont",
          title: "Fairmont Singapore",
          confirmation_ref: "470705216",
          amount: 1361,
        }),
        hotel({
          id: "crowne",
          title: "Crowne Plaza Changi Airport",
          confirmation_ref: "73564866232664",
          amount: 1182,
        }),
      ]
    );
    assert.deepEqual(plan.updates, [{ itemId: "fairmont" }]);
    assert.equal(plan.replacements.length, 0);
    assert.equal(plan.adds, 0);
    assert.equal(plan.choices.length, 0);
    assert.equal(hollowHotelCard({ kind: "hotel" }), true);
    assert.equal(
      hollowHotelCard({ kind: "hotel", confirmation_ref: "470705216", start_at: "2026-11-19" }),
      false
    );
  });

  it("recopie le prix d’une carte déjà annulée pour rouvrir le séjour", () => {
    const plan = replacementPlan(
      [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620173" }],
      [hotel({ lifecycle: "cancelled", amount: 1500 })]
    );
    assert.equal(plan.replacements[0].amount, 1500);
    const gesture = inboxStayAction({
      documentStatus: "confirmed",
      incoming: [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620173" }],
      bookingStatus: "cancelled",
      items: [hotel({ lifecycle: "cancelled", amount: 1500 })],
    });
    assert.equal(gesture.label, "Rouvrir et remplacer");
    assert.equal(gesture.action, "replace");
  });
});

describe("dates et visibilité", () => {
  it("cale les dates sur les cartes actives et garde une carte déjà montrée", () => {
    assert.deepEqual(
      activeCardDateRange([
        { kind: "hotel", lifecycle: "superseded", start_at: "2026-06-01", end_at: "2026-06-04" },
        { kind: "flight", start_at: "2026-06-12T08:00:00", end_at: "2026-06-12T10:00:00" },
        { kind: "hotel", start_at: "2026-06-13", end_at: "2026-06-16" },
      ]),
      { start: "2026-06-12", end: "2026-06-16" }
    );
    assert.equal(cardStaysShown({ visible_to_client: true }, true), true);
    assert.equal(cardStaysShown({ visible_to_client: true }, false), false);
    assert.equal(cardStaysShown(null, true), false);
  });

  it("laisse le cours de ski hors des dates du séjour", () => {
    assert.deepEqual(
      activeCardDateRange([
        { kind: "hotel", title: "L'Amara", start_at: "2027-03-20", end_at: "2027-03-27" },
        {
          kind: "activity",
          title: "COURS COLLECTIFS JOURNEE",
          supplier: "ESF",
          start_at: "2026-03-21T09:15:00",
          end_at: "2026-03-26T11:45:00",
        },
        {
          kind: "activity",
          title: "Forfaits Les Portes du Soleil",
          start_at: "2026-03-21",
          end_at: "2026-03-26",
        },
        { kind: "activity", title: "Location matériel de ski", start_at: "2026-03-20", end_at: "2026-03-27" },
      ]),
      { start: "2027-03-20", end: "2027-03-27" }
    );
    assert.deepEqual(
      stayDatesFromExtract({
        start_date: "2026-03-21",
        end_date: "2026-03-26",
        items: [{ kind: "activity", title: "Cours collectifs journée", start_at: "2026-03-21", end_at: "2026-03-26" }],
      }),
      { start: null, end: null }
    );
    assert.deepEqual(
      activeCardDateRange([
        { kind: "activity", title: "Visite", start_at: "2026-06-12", end_at: "2026-06-12" },
        { kind: "hotel", title: "Eden", start_at: "2026-06-13", end_at: "2026-06-16" },
      ]),
      { start: "2026-06-12", end: "2026-06-16" }
    );
  });
});

describe("annulation partielle", () => {
  it("retire l’hôtel et laisse le vol", () => {
    const plan = cancellationApplyPlan(
      { items: [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620170" }] },
      [hotel(), { id: "f1", kind: "flight", title: "Rome → Paris", confirmation_ref: "PNR1" }]
    );
    assert.deepEqual(plan.itemIds, ["h1"]);
    assert.equal(plan.cancelBooking, false);
  });

  it("annule le séjour s’il ne reste plus de carte", () => {
    const plan = cancellationApplyPlan(
      { items: [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620170" }] },
      [hotel()]
    );
    assert.equal(plan.cancelBooking, true);
  });

  it("nomme la carte qu’un mail d’annulation retirerait", () => {
    const gesture = inboxStayAction({
      documentStatus: "cancelled",
      incoming: [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620170" }],
      items: [hotel(), { id: "f1", kind: "flight", title: "Rome → Paris", confirmation_ref: "PNR1" }],
    });
    assert.equal(gesture.action, "cancel");
    assert.deepEqual(gesture.cancelCards, [{ id: "h1", title: "Hotel Eden" }]);
    assert.match(gesture.hint, /Hotel Eden/);
  });

  it("ignore l’annulation d’un ancien numéro NoMad quand la carte active en a un autre", () => {
    const oldStay = {
      kind: "hotel" as const,
      title: "The NoMad Hotel, London",
      confirmation_ref: "3103269814",
      start_at: "2026-10-30",
      end_at: "2026-11-03",
      details: { hotel_name: "The NoMad Hotel, London", le_hotel_id: 9882 },
    };
    const active = hotel({
      id: "laura",
      title: "NoMad London",
      confirmation_ref: "3103360446",
      start_at: "2026-10-29",
      end_at: "2026-11-03",
      details: { hotel_name: "NoMad London", le_hotel_id: 9882 },
    });
    const plan = cancellationApplyPlan({ items: [oldStay] }, [active]);
    assert.equal(plan.cancelBooking, false);
    assert.equal(plan.needsCardChoice, false);
    assert.deepEqual(plan.itemIds, []);
    const gesture = inboxStayAction({
      documentStatus: "cancelled",
      incoming: [oldStay],
      items: [active],
    });
    assert.equal(gesture.action, "attach");
  });
});
