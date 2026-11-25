import { createHash } from "node:crypto";
import { deflateRawSync, inflateRawSync, crc32 } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import forge from "node-forge";
import { productionOnlySecret } from "./preview-secrets";

export type PassFile = { name: string; data: Buffer };

export type WalletSigningMaterial = {
  p12: Buffer;
  password: string;
  passTypeId: string;
  teamId: string;
  wwdrPem: string;
};

const PASS_TYPE = /^pass\.[A-Za-z0-9.-]{3,80}$/;
const TEAM = /^[A-Za-z0-9]{10}$/;

/** Certificats publics Apple (WWDR G4 et G6). Pas un secret. */
export function bundledWwdrPem() {
  const dir = path.join(process.cwd(), "lib/crm/wallet");
  return ["AppleWWDRCAG4.pem", "AppleWWDRCAG6.pem"].map((name) => readFileSync(path.join(dir, name), "utf8")).join("\n");
}

/** Null si le certificat, le mot de passe, le type ou l’équipe manquent. Une preview ne signe pas. */
export function walletSigningMaterial(): WalletSigningMaterial | null {
  const encoded = productionOnlySecret(process.env.WALLET_PASS_CERT_P12);
  const password = productionOnlySecret(process.env.WALLET_PASS_CERT_PASSWORD);
  const passTypeId = productionOnlySecret(process.env.WALLET_PASS_TYPE_ID);
  const teamId = productionOnlySecret(process.env.WALLET_TEAM_ID);
  if (!encoded || !password || !PASS_TYPE.test(passTypeId) || !TEAM.test(teamId)) return null;
  const p12 = Buffer.from(encoded, "base64");
  if (p12.length < 64) return null;
  const override = productionOnlySecret(process.env.WALLET_WWDR_CERT_PEM);
  const wwdrPem = override.includes("BEGIN CERTIFICATE") ? override : bundledWwdrPem();
  if (!wwdrPem.includes("BEGIN CERTIFICATE")) return null;
  return { p12, password, passTypeId, teamId, wwdrPem };
}

export function walletSigningReady() {
  return walletSigningMaterial() !== null;
}

/** Sommes SHA-1, comme le manifeste PassKit. Les clés sont triées. */
export function passManifest(files: PassFile[]) {
  const rows = files
    .filter((file) => file.name !== "manifest.json" && file.name !== "signature")
    .map((file) => [file.name, createHash("sha1").update(file.data).digest("hex")] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(Object.fromEntries(rows));
}

function pemCertificates(pem: string) {
  return forge.pem
    .decode(pem)
    .filter((block) => block.type === "CERTIFICATE")
    .map((block) => forge.pki.certificateFromPem(forge.pem.encode(block)));
}

function sameModulus(cert: forge.pki.Certificate, key: forge.pki.rsa.PrivateKey) {
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  return Boolean(pub.n && key.n && pub.n.compareTo(key.n) === 0);
}

/** Signature PKCS#7 détachée du manifeste. SHA-1, le format que Cartes lit depuis l’origine. */
export function signPassManifest(manifest: string, material: Pick<WalletSigningMaterial, "p12" | "password" | "wwdrPem">) {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(material.p12.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, material.password);
  const shrouded = forge.pki.oids.pkcs8ShroudedKeyBag;
  const keyBagType = forge.pki.oids.keyBag;
  const keyBag =
    p12.getBags({ bagType: shrouded })[shrouded]?.[0] || p12.getBags({ bagType: keyBagType })[keyBagType]?.[0];
  const key = keyBag?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!key) throw new Error("clé absente");
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const bundled = certBags.map((bag) => bag.cert).filter((cert): cert is forge.pki.Certificate => Boolean(cert));
  const leaf = bundled.find((cert) => sameModulus(cert, key)) || bundled[0];
  if (!leaf) throw new Error("certificat absent");
  const wwdr = pemCertificates(material.wwdrPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest, "utf8");
  const seen = new Set<string>();
  for (const cert of [leaf, ...bundled, ...wwdr]) {
    const id = cert.serialNumber;
    if (seen.has(id)) continue;
    seen.add(id);
    p7.addCertificate(cert);
  }
  p7.addSigner({
    key,
    certificate: leaf,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}

function u16(value: number) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

function u32(value: number) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0);
  return buf;
}

/** Zip PassKit. Les noms restent à la racine. */
export function zipPass(files: PassFile[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    if (file.name.includes("/") || file.name.includes("\\") || file.name.includes("..")) {
      throw new Error("nom de fichier");
    }
    const name = Buffer.from(file.name);
    const data = deflateRawSync(file.data);
    const sum = crc32(file.data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(sum),
      u32(data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(sum),
      u32(data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, eocd]);
}

export function packPass(pass: Record<string, unknown>, images: PassFile[], material: WalletSigningMaterial) {
  const json = Buffer.from(JSON.stringify(pass));
  const files = [{ name: "pass.json", data: json }, ...images];
  const manifest = Buffer.from(passManifest(files));
  const signature = signPassManifest(manifest.toString("utf8"), material);
  return zipPass([...files, { name: "manifest.json", data: manifest }, { name: "signature", data: signature }]);
}

/** Lit une entrée décompressée. Null si le zip ou le nom ne conviennent pas. */
export function readZipEntry(bytes: Uint8Array, wanted: string) {
  if (bytes.byteLength < 22) return null;
  let eocd = -1;
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let index = bytes.length - 22; index >= min; index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = bytes[eocd + 8] | (bytes[eocd + 9] << 8);
  let cursor = bytes[eocd + 16] | (bytes[eocd + 17] << 8) | (bytes[eocd + 18] << 16) | (bytes[eocd + 19] << 24);
  cursor >>>= 0;
  for (let index = 0; index < count; index += 1) {
    const method = bytes[cursor + 10] | (bytes[cursor + 11] << 8);
    const compressed = (bytes[cursor + 20] | (bytes[cursor + 21] << 8) | (bytes[cursor + 22] << 16) | (bytes[cursor + 23] << 24)) >>> 0;
    const nameLen = bytes[cursor + 28] | (bytes[cursor + 29] << 8);
    const extraLen = bytes[cursor + 30] | (bytes[cursor + 31] << 8);
    const commentLen = bytes[cursor + 32] | (bytes[cursor + 33] << 8);
    const local = (bytes[cursor + 42] | (bytes[cursor + 43] << 8) | (bytes[cursor + 44] << 16) | (bytes[cursor + 45] << 24)) >>> 0;
    const name = Buffer.from(bytes.subarray(cursor + 46, cursor + 46 + nameLen)).toString("utf8");
    if (name === wanted) {
      const nameLenLocal = bytes[local + 26] | (bytes[local + 27] << 8);
      const extraLenLocal = bytes[local + 28] | (bytes[local + 29] << 8);
      const start = local + 30 + nameLenLocal + extraLenLocal;
      const slice = bytes.subarray(start, start + compressed);
      if (method === 0) return Buffer.from(slice);
      if (method === 8) return Buffer.from(inflateRawSync(slice));
      return null;
    }
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}
