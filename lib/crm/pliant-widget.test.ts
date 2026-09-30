import assert from "node:assert/strict";
import test from "node:test";
import {
  isPliantWidgetUrl,
  parsePliantWidgetOtp,
  pliantCardBlockMessage,
  pliantWidgetError,
  pliantWidgetFailure,
  pliantWidgetParams,
  pliantWidgetUrl,
} from "./pliant-widget";

const CARD = "0de79532-555b-4f14-bfbc-e51a25d073d1";

test("le widget n’accepte qu’un jeton court, jamais un numéro", () => {
  assert.equal(parsePliantWidgetOtp('"abc123"'), "abc123");
  assert.equal(parsePliantWidgetOtp(JSON.stringify({ otp: "otp-1" })), "otp-1");
  assert.equal(parsePliantWidgetOtp("plain-token"), "plain-token");
  assert.equal(parsePliantWidgetOtp("4242424242424242"), "");
  assert.equal(parsePliantWidgetOtp(""), "");
});

test("l’adresse du widget reste sur le coffre Pliant", () => {
  const params = pliantWidgetParams({ otp: "otp-1", cardId: CARD, frameId: "frame-1" });
  const url = pliantWidgetUrl("https://pci-api.getpliant.com", "trace-1", params);
  assert.equal(isPliantWidgetUrl(url), true);
  assert.equal(isPliantWidgetUrl("https://evil.example/card-details/widget"), false);
  const config = JSON.parse(Buffer.from(params, "base64").toString("utf8")) as { token: string; cardId: string };
  assert.equal(config.token, "otp-1");
  assert.equal(config.cardId, CARD);
  assert.equal(JSON.stringify(config).includes("4242"), false);
});

test("une carte non active a un message d’agence", () => {
  assert.equal(pliantCardBlockMessage("ACTIVE"), null);
  assert.equal(pliantCardBlockMessage("PENDING"), "La carte est encore en activation chez Pliant.");
  assert.equal(pliantCardBlockMessage("TERMINATED"), "Cette carte est clôturée.");
  assert.equal(pliantWidgetFailure(403), "Pliant refuse l’ouverture du numéro.");
  assert.equal(pliantWidgetError(new Error("réseau")), "La carte n’a pas pu être lue.");
  assert.equal(pliantWidgetError(new Error("Cette carte est verrouillée.")), "Cette carte est verrouillée.");
});
