import assert from "node:assert/strict";
import { createPrivateKey, generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";
import { apnsHost, apnsPrivateKeyPem, apnsRequestHeaders, isApnsDeviceToken, readApnsSettings, signApnsJwt } from "./apns-token";

test("les variables manquantes ou une preview n’arment pas APNs", () => {
  assert.equal(readApnsSettings({}), null);
  assert.equal(
    readApnsSettings({
      APNS_KEY_ID: "KEY1234567",
      APNS_TEAM_ID: "TEAM123456",
      APNS_KEY_P8: "pas une clé",
      APNS_PRODUCTION: "1",
    }),
    null
  );
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  assert.equal(
    readApnsSettings(
      { APNS_KEY_ID: "KEY1234567", APNS_TEAM_ID: "TEAM123456", APNS_KEY_P8: pem, APNS_PRODUCTION: "1" },
      true
    ),
    null
  );
  const settings = readApnsSettings({
    APNS_KEY_ID: "KEY1234567",
    APNS_TEAM_ID: "TEAM123456",
    APNS_KEY_P8: pem.replace(/\n/g, "\\n"),
    APNS_PRODUCTION: "0",
  });
  assert.equal(settings?.production, false);
  assert.equal(settings?.bundleId, "fr.travelba.client");
  assert.equal(apnsHost(true), "api.push.apple.com");
  assert.equal(apnsHost(false), "api.sandbox.push.apple.com");
});

test("le jeton JWT ES256 se vérifie avec la clé", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  assert.equal(apnsPrivateKeyPem(Buffer.from(pem).toString("base64")).includes("BEGIN PRIVATE KEY"), true);
  const jwt = signApnsJwt({ key: pem, keyId: "KEY1234567", teamId: "TEAM123456", issuedAt: 1_700_000_000 });
  const [header, claims, signature] = jwt.split(".");
  const parsed = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg: string; kid: string };
  assert.equal(parsed.alg, "ES256");
  assert.equal(parsed.kid, "KEY1234567");
  const body = JSON.parse(Buffer.from(claims, "base64url").toString("utf8")) as { iss: string; iat: number };
  assert.equal(body.iss, "TEAM123456");
  assert.equal(
    verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url")
    ),
    true
  );
  assert.equal(createPrivateKey(pem).type, "private");
});

test("un jeton appareil est hexadécimal", () => {
  assert.equal(isApnsDeviceToken("a".repeat(64)), true);
  assert.equal(isApnsDeviceToken("zzzz"), false);
  assert.equal(isApnsDeviceToken(`${"ab".repeat(32)} `), false);
  const live = apnsRequestHeaders({
    bundleId: "fr.travelba.client",
    pushType: "liveactivity",
    authorization: "jwt",
  });
  assert.equal(live["apns-topic"], "fr.travelba.client.push-type.liveactivity");
  assert.equal(live["apns-push-type"], "liveactivity");
  const alert = apnsRequestHeaders({ bundleId: "fr.travelba.client", authorization: "jwt" });
  assert.equal(alert["apns-topic"], "fr.travelba.client");
  assert.equal(alert["apns-push-type"], "alert");
});
