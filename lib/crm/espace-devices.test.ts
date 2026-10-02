import assert from "node:assert/strict";
import test from "node:test";
import { espaceDeviceFromBody, expoPushMessages, normalizeExpoPushToken } from "./espace-devices";

test("seul un jeton Expo ou APNs compact est accepté", () => {
  assert.equal(normalizeExpoPushToken("ExponentPushToken[abc]"), "ExponentPushToken[abc]");
  assert.equal(normalizeExpoPushToken("not a token"), null);
  assert.equal(normalizeExpoPushToken(""), null);
});

test("Android est refusé — iPhone only", () => {
  const bad = espaceDeviceFromBody({ token: "ExponentPushToken[abc]", platform: "android" });
  assert.equal("error" in bad, true);
  const ok = espaceDeviceFromBody({ token: "ExponentPushToken[abc]", platform: "ios" });
  assert.equal("error" in ok, false);
});

test("le message Expo n’ajoute pas de cloche fantôme", () => {
  const messages = expoPushMessages(["ExponentPushToken[abc]"], {
    title: "Votre séjour est prêt",
    body: "Le carnet Avoriaz est dans votre espace.",
    data: { kind: "carnet", path: "/mon-compte" },
  });
  assert.equal(messages[0]?.sound, "default");
  assert.equal(messages[0]?.data.kind, "carnet");
});
