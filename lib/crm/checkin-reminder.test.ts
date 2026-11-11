import assert from "node:assert/strict";
import test from "node:test";
import { checkinReminderBlocked, type ReminderFlight } from "./checkin-reminder";

const flight: ReminderFlight = {
  id: "flight-1",
  booking_id: "booking-1",
  details: { flight_number: "AF 7308", from: "CDG", to: "NCE" },
};

const other: ReminderFlight = {
  id: "flight-2",
  booking_id: "booking-1",
  details: { flight_number: "AF 7309", from: "NCE", to: "CDG" },
};

const pass = {
  id: "doc-1",
  booking_id: "booking-1",
  booking_item_id: "flight-1",
  kind: "carte d'embarquement",
  file_name: "Carte embarquement MARTIN Camille AF7308.pdf",
};

test("le rappel d’enregistrement ne part pas si le vol est déjà enregistré ou les cartes parties", () => {
  const base = { flight, flightsOnBooking: 1, documents: [], messages: [] };
  assert.equal(checkinReminderBlocked({ ...base, status: "fait" }), true);
  assert.equal(checkinReminderBlocked({ ...base, status: "cartes_recues" }), true);
  assert.equal(checkinReminderBlocked({ ...base, status: "envoyees" }), true);
  assert.equal(checkinReminderBlocked({ ...base, status: "ouvert" }), false);
  assert.equal(checkinReminderBlocked({ ...base, status: null }), false);
});

test("une carte d’embarquement ou un WhatsApp déjà envoyé bloque ce vol seulement", () => {
  assert.equal(
    checkinReminderBlocked({
      status: "ouvert",
      flight,
      flightsOnBooking: 2,
      documents: [pass],
      messages: [],
    }),
    true
  );
  assert.equal(
    checkinReminderBlocked({
      status: "ouvert",
      flight: other,
      flightsOnBooking: 2,
      documents: [pass],
      messages: [],
    }),
    false
  );
  assert.equal(
    checkinReminderBlocked({
      status: "ouvert",
      flight,
      flightsOnBooking: 2,
      documents: [],
      messages: [
        {
          booking_id: "booking-1",
          template_key: "carte_embarquement",
          status: "sent",
          body: "Votre carte d’embarquement pour le vol AF 7308 est jointe.",
          payload: { document_id: "doc-1" },
        },
      ],
    }),
    true
  );
  assert.equal(
    checkinReminderBlocked({
      status: "ouvert",
      flight: other,
      flightsOnBooking: 2,
      documents: [],
      messages: [
        {
          booking_id: "booking-1",
          template_key: "carte_embarquement",
          status: "sent",
          body: "Votre carte d’embarquement pour le vol AF 7308 est jointe.",
        },
      ],
    }),
    false
  );
  assert.equal(
    checkinReminderBlocked({
      status: "ouvert",
      flight,
      flightsOnBooking: 2,
      documents: [],
      messages: [
        {
          booking_id: "booking-1",
          template_key: "carte_embarquement",
          status: "failed",
          body: "AF 7308",
        },
      ],
    }),
    false
  );
});

test("un seul vol du dossier et un envoi sans numéro suffisent à couper le rappel", () => {
  assert.equal(
    checkinReminderBlocked({
      status: "a_faire",
      flight,
      flightsOnBooking: 1,
      documents: [],
      messages: [
        {
          booking_id: "booking-1",
          template_key: "cartes_embarquement",
          status: "delivered",
          body: "Voici la carte d’embarquement.",
        },
      ],
    }),
    true
  );
});
