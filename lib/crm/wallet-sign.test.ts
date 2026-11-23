import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import forge from "node-forge";
import { buildBoardingPass, WALLET_PASS_TYPE_ID } from "./wallet-pass";
import { packPass, passManifest, readZipEntry, signPassManifest, type WalletSigningMaterial } from "./wallet-sign";
import { readWalletPass } from "./pkpass";

function material(): WalletSigningMaterial {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "010203";
  cert.validity.notBefore = new Date("2026-01-01T00:00:00Z");
  cert.validity.notAfter = new Date("2027-01-01T00:00:00Z");
  const attrs = [
    { name: "commonName", value: WALLET_PASS_TYPE_ID },
    { name: "organizationName", value: "Travel Business Agency" },
    { shortName: "C", value: "FR" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "secret", { algorithm: "3des" });
  const p12 = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), "binary");
  const wwdr = forge.pki.createCertificate();
  const wwdrKeys = forge.pki.rsa.generateKeyPair(2048);
  wwdr.publicKey = wwdrKeys.publicKey;
  wwdr.serialNumber = "0a";
  wwdr.validity.notBefore = new Date("2026-01-01T00:00:00Z");
  wwdr.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  const wwdrAttrs = [{ name: "commonName", value: "WWDR test" }];
  wwdr.setSubject(wwdrAttrs);
  wwdr.setIssuer(wwdrAttrs);
  wwdr.sign(wwdrKeys.privateKey, forge.md.sha256.create());
  return { p12, password: "secret", passTypeId: WALLET_PASS_TYPE_ID, teamId: "ABCDE12345", wwdrPem: forge.pki.certificateToPem(wwdr) };
}

test("le passe signé est un zip dont le manifeste correspond et que la lecture reconnaît", () => {
  const signing = material();
  const built = buildBoardingPass(
    {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "flight",
      title: "Paris → New York",
      supplier: "Air Example",
      confirmation_ref: "AB12CD",
      start_at: "2026-11-12T14:20:00",
      details: { flight_number: "EX100", from: "CDG", to: "JFK", city_from: "Paris", city_to: "New York", seat: "12A" },
      visible_to_client: true,
    },
    "Camille Martin",
    { passTypeId: signing.passTypeId, teamId: signing.teamId }
  );
  assert.ok(built);
  const icon = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const images = [{ name: "icon.png", data: icon }];
  const packed = packPass(built.pass, images, signing);
  const passJson = readZipEntry(packed, "pass.json");
  const manifestRaw = readZipEntry(packed, "manifest.json");
  const signature = readZipEntry(packed, "signature");
  assert.ok(passJson && manifestRaw && signature);
  const manifest = JSON.parse(manifestRaw.toString("utf8")) as Record<string, string>;
  assert.equal(manifest["pass.json"], createHash("sha1").update(passJson).digest("hex"));
  assert.equal(manifest["icon.png"], createHash("sha1").update(icon).digest("hex"));
  assert.equal(manifestRaw.toString("utf8"), passManifest([{ name: "pass.json", data: passJson }, ...images]));
  assert.equal(signature[0], 0x30);
  const parsed = forge.pkcs7.messageFromAsn1(
    forge.asn1.fromDer(forge.util.createBuffer(signature.toString("binary")))
  ) as forge.pkcs7.PkcsSignedData;
  assert.ok(parsed.certificates.length >= 2);
  const read = readWalletPass(new Uint8Array(packed));
  assert.equal(read?.flight, "EX100");
  assert.equal(read?.seat, "12A");
  assert.equal(read?.route, "Paris → New York");
  const digest = createHash("sha1").update(manifestRaw).digest();
  const signed = signPassManifest(manifestRaw.toString("utf8"), signing);
  assert.ok(signed.length > 64);
  assert.ok(digest.length === 20);
});
