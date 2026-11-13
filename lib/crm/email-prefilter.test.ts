import assert from "node:assert/strict";
import test from "node:test";
import { classifyInboundMail, dropInboundImage, SIGNATURE_IMAGE_BYTES } from "./email-prefilter";
import { unfoldMail } from "./nested-mail";

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
  assert.equal(dropInboundImage({ filename: "image.png", mimeType: "image/png", size: 80_000 }), true);
  assert.equal(dropInboundImage({ filename: "image006.png", mimeType: "image/png", size: 80_000 }), true);
  assert.equal(
    dropInboundImage({
      filename: "a1b2c3d4-e5f6-7890-abcd-ef1234567890.png",
      mimeType: "image/png",
      size: 120_000,
    }),
    true
  );
  assert.equal(
    dropInboundImage({ filename: "", mimeType: "image/png", size: SIGNATURE_IMAGE_BYTES + 1 }),
    true
  );
  assert.equal(
    dropInboundImage({ filename: "voucher.jpg", mimeType: "image/jpeg", size: SIGNATURE_IMAGE_BYTES + 1 }),
    false
  );
  assert.equal(
    dropInboundImage({ filename: "imagery.png", mimeType: "image/png", size: SIGNATURE_IMAGE_BYTES + 1 }),
    false
  );
});

test("un mail transféré envoie ses images au même filtre", () => {
  const pixel =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const raw = [
    "Subject: TR: confirmation",
    "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=outer",
    "",
    "--outer",
    "Content-Type: message/rfc822; name=\"forward.eml\"",
    "Content-Disposition: attachment; filename=\"forward.eml\"",
    "",
    "Subject: capture",
    "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=inner",
    "",
    "--inner",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Confirmation de séjour.",
    "--inner",
    "Content-Type: image/png; name=\"image001.png\"",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: inline; filename=\"image001.png\"",
    "",
    pixel,
    "--inner",
    "Content-Type: image/png",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: inline; filename=\"a1b2c3d4-e5f6-7890-abcd-ef1234567890.png\"",
    "",
    pixel,
    "--inner",
    "Content-Type: image/png; name=\"image.png\"",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: inline; filename=\"image.png\"",
    "",
    pixel,
    "--inner",
    "Content-Type: image/jpeg; name=\"voucher.jpg\"",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: attachment; filename=\"voucher.jpg\"",
    "",
    pixel,
    "--inner--",
    "--outer--",
    "",
  ].join("\n");
  const unfolded = unfoldMail(raw);
  const names = unfolded.files.map((file) => file.name).sort();
  assert.deepEqual(names, [
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890.png",
    "image.png",
    "image001.png",
    "voucher.jpg",
  ]);
  const kept = unfolded.files.filter(
    (file) => !dropInboundImage({ filename: file.name, mimeType: file.mime, size: Math.max(file.bytes.byteLength, 80_000) })
  );
  assert.deepEqual(
    kept.map((file) => file.name),
    ["voucher.jpg"]
  );
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

test("un label suivi reste dans la file, même s’il ressemble à une newsletter", () => {
  assert.equal(
    classifyInboundMail({
      subject: "What kind of skier is your client?",
      text: "View this email in your browser. Unsubscribe.",
      label: "reservations-tba",
    }),
    null
  );
});

test("un objet vide, y compris le label crm, reste dans la file", () => {
  assert.equal(classifyInboundMail({ subject: "", text: "", label: "crm" }), null);
  assert.equal(classifyInboundMail({ subject: "", text: "", label: "billet-avion" }), null);
});

test("une confirmation fournisseur n’est pas écartée par le pied de page", () => {
  const text = `${"Confirmation de réservation à Milan. ".repeat(20)}Unsubscribe`;
  assert.equal(classifyInboundMail({ subject: "Booking", text, label: "little-emperors" }), null);
  assert.equal(classifyInboundMail({ subject: "Votre réservation", text }), null);
});
