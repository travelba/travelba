import assert from "node:assert/strict";
import test from "node:test";
import { buildVisaDeskMail, deliverVisaDeskMail, notifyVisaDeskEvent, redactDeskText } from "./visa-desk-mail";

const PASSPORT = "12AB34567";
const PAN = "4242424242424242";
const BOOKING = "d2483cfd-0db6-4175-8bf6-a6ebc0cf003b";

test("le texte d’avis retire passeport et numéro de carte", () => {
  const text = redactDeskText(`Voyageur ${PASSPORT} carte ${PAN} et 4242 4242 4242 4242 plafond 37.52`);
  assert.equal(text.includes(PASSPORT), false);
  assert.equal(text.includes(PAN), false);
  assert.equal(text.includes("4242 4242"), false);
  assert.match(text, /37\.52/);
});

test("une erreur part à l’agence sans donnée de carte ni de passeport", () => {
  const mail = buildVisaDeskMail({
    reference: "TB-2026-0033",
    bookingId: BOOKING,
    kind: "erreur",
    text: `Le portail n’a pas été rempli. Passeport ${PASSPORT}. Carte ${PAN}.`,
    to: "contact@travelba.fr",
  });
  assert.ok(mail);
  const blob = `${mail.subject}\n${mail.text}\n${mail.html}`;
  assert.match(mail.subject, /ETA-IL · TB-2026-0033 · Erreur/);
  assert.match(blob, /n’a pas été rempli/);
  assert.match(blob, /Ouvrir le dossier/);
  assert.match(blob, new RegExp(`/admin/reservations/${BOOKING}`));
  assert.equal(blob.includes(PASSPORT), false);
  assert.equal(blob.includes(PAN), false);
});

test("les clics restent dans le journal, pas dans la boîte mail", () => {
  assert.equal(
    buildVisaDeskMail({
      reference: "TB-2026-0033",
      bookingId: BOOKING,
      kind: "champ",
      text: `Champ « Passeport » ${PASSPORT}`,
      to: "contact@travelba.fr",
    }),
    null
  );
  assert.equal(
    buildVisaDeskMail({
      reference: "TB-2026-0033",
      bookingId: BOOKING,
      kind: "page",
      text: "Clic · Continuer",
      to: "contact@travelba.fr",
    }),
    null
  );
});

test("sans clé d’envoi, l’avis ne part pas et n’échoue pas le journal", async () => {
  let called = false;
  const delivered = await deliverVisaDeskMail(
    {
      to: "contact@travelba.fr",
      subject: "ETA-IL",
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

test("le plafond part, le numéro de carte non", async () => {
  let seen = "";
  const delivered = await notifyVisaDeskEvent({
    reference: "TB-2026-0033",
    bookingId: BOOKING,
    kind: "fini",
    text: `Carte Pliant. Plafond 37.52 € pour 100 ILS. ${PAN}`,
    to: "contact@travelba.fr",
    deliver: async (mail) => {
      seen = `${mail.subject}\n${mail.text}\n${mail.html}`;
      return true;
    },
  });
  assert.equal(delivered, true);
  assert.match(seen, /37\.52/);
  assert.match(seen, /100 ILS/);
  assert.match(seen, /Pliant/);
  assert.equal(seen.includes(PAN), false);
});

test("un échec d’envoi ne remonte pas", async () => {
  const delivered = await notifyVisaDeskEvent({
    reference: "TB-2026-0033",
    bookingId: BOOKING,
    kind: "erreur",
    text: "Le portail n’a pas été rempli.",
    to: "contact@travelba.fr",
    deliver: async () => {
      throw new Error("reseau");
    },
  });
  assert.equal(delivered, false);
});
