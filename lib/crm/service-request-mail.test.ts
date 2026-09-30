import assert from "node:assert/strict";
import test from "node:test";
import { buildServiceRequestMail, deliverServiceRequestMail, notifyServiceRequest } from "./service-request-mail";

const BOOKING = "d2483cfd-0db6-4175-8bf6-a6ebc0cf003b";
const now = new Date("2026-12-01T10:00:00Z");

const flight = {
  id: "out",
  kind: "flight",
  start_at: "2026-12-14T11:30:00+00:00",
  end_at: "2026-12-14T17:10:00+00:00",
  details: {
    from: "ORY",
    to: "TLV",
    city_from: "Paris",
    city_to: "Tel Aviv",
    flight_number: "TO 3458",
    airline_iata: "TO",
  },
};

test("le transfert validé part à l’agence avec les deux adresses", () => {
  const mail = buildServiceRequestMail({
    to: "contact@travelba.fr",
    reference: "TB-2026-0042",
    bookingId: BOOKING,
    holderName: "Ada Martin",
    amount: 150,
    reason: "validated",
    now,
    item: {
      kind: "chauffeur",
      title: "Transfert aller",
      details: {
        service_leg: "departure",
        place: "home",
        depart_address: "12 rue de Rivoli, 75004 Paris",
        arrive_address: "ORY · Paris",
        pickup: "12 rue de Rivoli, 75004 Paris",
      },
    },
    items: [flight],
  });
  assert.ok(mail);
  assert.equal(mail.subject, "Ada Martin · Transfert aller · TB-2026-0042");
  const blob = `${mail.subject}\n${mail.text}\n${mail.html}`;
  assert.match(blob, /a validé ce service/);
  assert.match(blob, /12 rue de Rivoli, 75004 Paris/);
  assert.match(blob, /ORY · Paris/);
  assert.match(blob, /TO 3458/);
  assert.match(blob, /150/);
  assert.match(blob, /Ouvrir le dossier/);
  assert.match(blob, new RegExp(`/admin/reservations/${BOOKING}`));
  assert.match(blob, /#0B192C/);
  assert.match(blob, /#C5A880/);
});

test("une adresse saisie n’injecte pas de html", () => {
  const mail = buildServiceRequestMail({
    to: "contact@travelba.fr",
    reference: "TB-1",
    bookingId: BOOKING,
    holderName: "Ada\r\nMartin",
    amount: 150,
    reason: "validated",
    now,
    item: {
      kind: "chauffeur",
      title: "Transfert aller",
      details: {
        service_leg: "departure",
        place: "home",
        depart_address: `<script>alert(1)</script>`,
        arrive_address: "ORY · Paris",
      },
    },
    items: [flight],
  });
  assert.ok(mail);
  assert.equal(mail.subject.includes("\n"), false);
  assert.equal(mail.html.includes("<script>"), false);
  assert.match(mail.html, /&lt;script&gt;/);
});

test("le VIP indique le moment et les voyageurs", () => {
  const mail = buildServiceRequestMail({
    to: "contact@travelba.fr",
    reference: "TB-2026-0042",
    bookingId: BOOKING,
    holderName: "Ada Martin",
    amount: 225,
    reason: "validated",
    now,
    item: {
      kind: "greeter",
      title: "Accueil VIP et Fastpass aller",
      details: { service_leg: "departure", moment: "depart", adults: 2, children: 1 },
    },
    items: [flight],
  });
  assert.ok(mail);
  assert.match(mail.text, /Départ/);
  assert.match(mail.text, /2 adultes, 1 enfant/);
  assert.match(mail.text, /225/);
});

test("l’enregistrement sans fenêtre connue n’invente pas d’heure", () => {
  const mail = buildServiceRequestMail({
    to: "contact@travelba.fr",
    reference: "TB-2026-0042",
    bookingId: BOOKING,
    holderName: "Ada Martin",
    amount: 20,
    reason: "validated",
    now,
    item: { kind: "checkin", title: "Enregistrement (2 passagers)", details: { passengers: 2 } },
    items: [{ kind: "flight", start_at: "2026-12-14T11:30:00Z", details: { flight_number: "SS 1" } }],
  });
  assert.ok(mail);
  assert.match(mail.text, /Passagers : 2/);
  assert.equal(mail.text.includes("Fenêtre"), false);
  assert.equal(/\d{1,2}h\d{2}/.test(mail.text), false);
});

test("une nouvelle adresse reprend le même modèle", () => {
  const mail = buildServiceRequestMail({
    to: "contact@travelba.fr",
    reference: "TB-2026-0042",
    bookingId: BOOKING,
    holderName: "Ada Martin",
    amount: 150,
    reason: "addresses",
    now,
    item: {
      kind: "chauffeur",
      title: "Transfert aller",
      details: {
        service_leg: "departure",
        place: "home",
        depart_address: "8 avenue de l'Opéra, 75001 Paris",
        arrive_address: "Terminal 2E, 77990 Le Mesnil-Amelot",
      },
    },
    items: [flight],
  });
  assert.ok(mail);
  assert.match(mail.subject, /Nouvelles adresses/);
  assert.match(mail.html, /Nouvelles adresses/);
  assert.match(mail.text, /8 avenue de l'Opéra, 75001 Paris/);
  assert.match(mail.text, /Terminal 2E, 77990 Le Mesnil-Amelot/);
});

test("le visa ne déclenche pas cet avis", () => {
  assert.equal(
    buildServiceRequestMail({
      to: "contact@travelba.fr",
      reference: "TB-1",
      bookingId: BOOKING,
      holderName: "Ada",
      amount: 25,
      reason: "validated",
      item: { kind: "visa" },
      items: [],
    }),
    null
  );
});

test("sans clé d’envoi, l’avis ne part pas", async () => {
  let called = false;
  const delivered = await deliverServiceRequestMail(
    {
      to: "contact@travelba.fr",
      subject: "Ada · Transfert",
      html: "<p>ok</p>",
      text: "ok",
    },
    {
      apiKey: "",
      send: async () => {
        called = true;
        return { error: null };
      },
    }
  );
  assert.equal(delivered, false);
  assert.equal(called, false);
});

test("contact est en copie si le destinataire est une autre boîte", async () => {
  let cc: string[] | undefined;
  const delivered = await deliverServiceRequestMail(
    {
      to: "desk@example.com",
      subject: "Ada · Transfert",
      html: "<p>ok</p>",
      text: "ok",
    },
    {
      apiKey: "re_test",
      send: async (input) => {
        cc = input.cc;
        return { error: null };
      },
    }
  );
  assert.equal(delivered, true);
  assert.deepEqual(cc, ["contact@travelba.fr"]);
});

test("un échec d’envoi ne remonte pas", async () => {
  const delivered = await notifyServiceRequest({
    reference: "TB-1",
    bookingId: BOOKING,
    holderName: "Ada",
    amount: 150,
    reason: "validated",
    to: "contact@travelba.fr",
    item: { kind: "chauffeur", title: "Transfert aller", details: { service_leg: "departure", place: "home" } },
    items: [flight],
    deliver: async () => {
      throw new Error("reseau");
    },
  });
  assert.equal(delivered, false);
});
