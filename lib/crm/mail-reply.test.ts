import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InboundReplies } from "../../components/admin/InboundReplies";
import {
  hotelContactsToAdd,
  includeAppearedContacts,
  replyAddresses,
  replyDraftBody,
  replyHref,
  replyQuote,
  threadPartyAddresses,
  threadingHeaders,
} from "./mail-reply";

test("la réponse part à l’expéditeur et copie les autres destinataires", () => {
  assert.deepEqual(
    replyAddresses({
      from: "Reservations <agent@sofitel.com>",
      originals: ["reservations@sofitel.com", "agent@sofitel.com", "contact@travelba.fr"],
    }),
    { to: ["agent@sofitel.com"], cc: ["reservations@sofitel.com"] }
  );
  assert.deepEqual(replyAddresses({ from: "", originals: ["desk@hotel.test"] }), {
    to: ["desk@hotel.test"],
    cc: [],
  });
});

test("une personne du fil reste dans la relance et dans la réponse", () => {
  const parties = [
    {
      inbound: true,
      from: "Achraf Chouichi <achraf@sofitel.com>",
      fromName: "Achraf Chouichi",
      to: ["contact@travelba.fr"],
      cc: ["spa@sofitel.com", "bookings@littleemperors.com", "guest@client.test"],
    },
  ];
  assert.deepEqual(
    threadPartyAddresses({
      mode: "followup",
      originals: ["reservations@sofitel.com", "contact@travelba.fr"],
      parties,
      exclude: ["guest@client.test"],
    }),
    { to: ["reservations@sofitel.com"], cc: ["achraf@sofitel.com", "spa@sofitel.com"] }
  );
  assert.deepEqual(
    threadPartyAddresses({
      mode: "reply",
      from: "achraf@sofitel.com",
      originals: ["reservations@sofitel.com"],
      parties,
      exclude: ["guest@client.test"],
    }),
    { to: ["achraf@sofitel.com"], cc: ["reservations@sofitel.com", "spa@sofitel.com"] }
  );
  assert.deepEqual(
    includeAppearedContacts({
      mode: "followup",
      originals: ["reservations@sofitel.com"],
      parties,
      postedTo: ["reservations@sofitel.com"],
      postedCc: [],
      exclude: ["guest@client.test"],
    }),
    { to: ["reservations@sofitel.com"], cc: ["achraf@sofitel.com", "spa@sofitel.com"] }
  );
});

test("un contact déjà sur l’hôtel n’est pas recréé", () => {
  assert.deepEqual(
    hotelContactsToAdd({
      existing: ["Achraf@Sofitel.com"],
      candidates: [
        { email: "achraf@sofitel.com", name: "Achraf Chouichi" },
        { email: "spa@sofitel.com", name: "Spa Desk" },
        { email: "guest@client.test", name: "Camille Martin" },
        { email: "bookings@littleemperors.com" },
        { email: "contact@travelba.fr" },
      ],
      exclude: ["guest@client.test"],
    }),
    [{ email: "spa@sofitel.com", firstName: "Spa", lastName: "Desk" }]
  );
});

test("la citation reprend le message, sans carte", () => {
  const body = replyDraftBody({
    body: "Le transfert est confirmé.\nCarte 4242 4242 4242 4242\nÀ 18 h 40.",
    at: "2026-10-26T13:56:00.000Z",
    speaker: "Sofitel Agadir",
  });
  assert.match(body, /Nous faisons suite à votre message/);
  assert.match(body, /Le 26 oct\. 2026, Sofitel Agadir a écrit :/);
  assert.match(body, /> Le transfert est confirmé\./);
  assert.match(body, /> À 18 h 40\./);
  assert.equal(body.includes("4242"), false);
  assert.equal(body.includes("Carte"), false);
  assert.match(body, /Bien à vous,\n\nTravel Business Agency$/);
  assert.equal(replyQuote(""), "");
});

test("In-Reply-To vise ce message et References garde la chaîne", () => {
  assert.equal(threadingHeaders({ messageId: "" }), null);
  assert.deepEqual(
    threadingHeaders({
      messageId: "abc@sofitel.com",
      references: "<root@travelba.fr> <mid@sofitel.com>",
      inReplyTo: "<mid@sofitel.com>",
    }),
    {
      "In-Reply-To": "<abc@sofitel.com>",
      References: "<root@travelba.fr> <mid@sofitel.com> <abc@sofitel.com>",
    }
  );
});

test("le lien et la liste des réponses", () => {
  assert.equal(
    replyHref("booking-1", "item-1", "thread-1"),
    "/admin/reservations/booking-1?hotel=item-1&repondre=thread-1"
  );
  const html = renderToStaticMarkup(
    createElement(InboundReplies, {
      rows: [
        {
          id: "thread-1",
          href: "/admin/reservations/booking-1?hotel=item-1&repondre=thread-1",
          title: "Sofitel Agadir · QSXDDQSP",
          subject: "RE: Samuel Chocron — Transfer — QSXDDQSP",
          kind: "Réponse",
          sentAt: "2026-10-26T13:56:00.000Z",
        },
      ],
    })
  );
  assert.match(html, /Répondre/);
  assert.match(html, /Sofitel Agadir/);
  assert.match(html, /href="\/admin\/reservations\/booking-1\?hotel=item-1&amp;repondre=thread-1"/);
  assert.equal(html.includes("@"), false);
  assert.equal(html.includes("Envoyer"), false);
});
