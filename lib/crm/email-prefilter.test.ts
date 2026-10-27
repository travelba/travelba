import assert from "node:assert/strict";
import test from "node:test";
import { classifyInboundMail, dropInboundImage, SIGNATURE_IMAGE_BYTES } from "./email-prefilter";

test("les images trop légères et les logos de signature ne vont pas au modèle", () => {
  assert.equal(dropInboundImage({ filename: "photo.jpg", mimeType: "image/jpeg", size: 19_000 }), true);
  assert.equal(dropInboundImage({ filename: "image001.png", mimeType: "image/png", size: 80_000 }), true);
  assert.equal(dropInboundImage({ filename: "AppStoreBadge.png", mimeType: "image/png", size: 40_000 }), true);
  assert.equal(dropInboundImage({ filename: "logo-footer.gif", mimeType: "image/gif", size: 50_000 }), true);
  assert.equal(
    dropInboundImage({ filename: "hotel.jpg", mimeType: "image/jpeg", size: SIGNATURE_IMAGE_BYTES + 1 }),
    false
  );
  assert.equal(dropInboundImage({ filename: "confirmation.pdf", mimeType: "application/pdf", size: 4_000 }), false);
});

test("publicité, code, guide API et newsletter sont ignorés sans modèle", () => {
  assert.deepEqual(classifyInboundMail({ subject: "Votre code", text: "Code de connexion : 482913" }), {
    reason: "Code de connexion",
  });
  assert.deepEqual(classifyInboundMail({ subject: "Code", text: "918273" }), { reason: "Code de connexion" });
  assert.deepEqual(
    classifyInboundMail({ subject: "API documentation", text: "Getting started with the API." }),
    { reason: "Guide API" }
  );
  assert.deepEqual(
    classifyInboundMail({ subject: "Newsletter de mars", text: "Se désabonner en bas de page." }),
    { reason: "Newsletter" }
  );
  assert.deepEqual(classifyInboundMail({ subject: "Offre exclusive", text: "20 % de réduction ce week-end." }), {
    reason: "Publicité",
  });
});

test("une newsletter sur la boîte ouverte n’est pas une confirmation", () => {
  assert.deepEqual(
    classifyInboundMail({
      subject: "What kind of skier is your client?",
      text: "View this email in your browser. Unsubscribe.",
      label: "reservations-tba",
    }),
    { reason: "Newsletter" }
  );
  assert.equal(
    classifyInboundMail({
      subject: "What kind of skier is your client?",
      text: "View this email in your browser.",
      label: "crm",
    })?.reason,
    "Newsletter"
  );
});

test("une confirmation fournisseur n’est pas écartée par le pied de page", () => {
  const text = `${"Confirmation de réservation à Milan. ".repeat(20)}Unsubscribe`;
  assert.equal(classifyInboundMail({ subject: "Booking", text, label: "little-emperors" }), null);
  assert.equal(classifyInboundMail({ subject: "Votre réservation", text }), null);
});
