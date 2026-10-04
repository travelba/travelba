import assert from "node:assert/strict";
import test from "node:test";
import { pliantOtpToken, pliantPciWidgetUrl, pliantWidgetEvent } from "./pliant-pci";

const cardId = "deb28ff1-75ef-4f85-9ef9-5f91b5a7a9fe";
const traceId = "a1b2c3d4-e5f6-4789-a012-3456789abcde";

test("l’OTP du coffre est un code court", () => {
  assert.equal(pliantOtpToken("12345678"), "12345678");
  assert.equal(pliantOtpToken('"12345678"'), "12345678");
  assert.equal(pliantOtpToken('{"token":"12345678"}'), null);
});

test("le cadre PCI porte l’OTP et l’identifiant, sans autre hôte", () => {
  const url = pliantPciWidgetUrl({
    host: "https://pci-api.getpliant.com",
    traceId,
    cardId,
    token: "12345678",
    frameId: "carte-1",
  });
  assert.ok(url);
  const parsed = new URL(url || "");
  assert.equal(parsed.origin, "https://pci-api.getpliant.com");
  assert.equal(parsed.pathname, "/card-details/widget");
  assert.equal(parsed.searchParams.get("traceId"), traceId);
  const config = JSON.parse(Buffer.from(parsed.searchParams.get("params") || "", "base64").toString("utf8")) as {
    token: string;
    cardId: string;
    frameId: string;
  };
  assert.equal(config.token, "12345678");
  assert.equal(config.cardId, cardId);
  assert.equal(config.frameId, "carte-1");
  assert.equal(
    pliantPciWidgetUrl({ host: "https://travelba.fr", traceId, cardId, token: "12345678", frameId: "carte-1" }),
    null
  );
});

test("le message du cadre nomme l’événement", () => {
  assert.deepEqual(pliantWidgetEvent({ eventType: "CARD_DATA_CLEARED", frameId: "carte-1" }), {
    eventType: "CARD_DATA_CLEARED",
    frameId: "carte-1",
  });
  assert.equal(pliantWidgetEvent("non"), null);
});
