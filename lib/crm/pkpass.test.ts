import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync, crc32 } from "node:zlib";
import { matchWalletPass, readWalletPass, storedWalletPass, type WalletPassExtract } from "./pkpass";

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

function zip(files: { name: string; data: Buffer; method: 0 | 8 }[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = file.method === 8 ? deflateRawSync(file.data) : file.data;
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(file.method),
      u16(0),
      u16(0),
      u32(crc32(file.data)),
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
      u16(file.method),
      u16(0),
      u16(0),
      u32(crc32(file.data)),
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
  return new Uint8Array(Buffer.concat([...locals, centralDir, eocd]));
}

function pass(partial: Record<string, unknown> = {}) {
  return {
    formatVersion: 1,
    organizationName: "Air France",
    description: "Carte d'embarquement",
    relevantDate: "2026-11-11T12:50:00Z",
    boardingPass: {
      transitType: "PKTransitTypeAir",
      headerFields: [{ key: "flight", label: "VOL", value: "AF7308" }],
      primaryFields: [
        { key: "origin", label: "Paris", value: "CDG" },
        { key: "destination", label: "Nice", value: "NCE" },
      ],
      secondaryFields: [
        { key: "passenger", label: "PASSAGER", value: "MARTIN/CAMILLE" },
        { key: "seat", label: "SIÈGE", value: "12A" },
      ],
      auxiliaryFields: [{ key: "gate", label: "PORTE", value: "K42" }],
      backFields: [{ key: "pnr", label: "Réservation", value: "AB12CD" }],
    },
    ...partial,
  };
}

const flights = [
  { id: "aller", flightNumber: "AF 7308", date: "2026-11-11", pnr: "AB12CD" },
  { id: "retour", flightNumber: "AF 7309", date: "2026-11-18", pnr: "AB12CD" },
];

const travelers = [
  { id: "camille", firstName: "Camille", lastName: "Martin" },
  { id: "ines", firstName: "Inès", lastName: "Martin" },
];

test("pass.json décompressé donne le passager, le vol, le siège, la porte et le PNR", () => {
  const bytes = zip([
    { name: "pass.json", data: Buffer.from(JSON.stringify(pass())), method: 8 },
    { name: "manifest.json", data: Buffer.from("{}"), method: 0 },
  ]);
  const read = readWalletPass(bytes);
  assert.ok(read);
  assert.equal(read.firstName, "Camille");
  assert.equal(read.lastName, "Martin");
  assert.equal(read.flight, "AF7308");
  assert.equal(read.date, "2026-11-11");
  assert.equal(read.seat, "12A");
  assert.equal(read.gate, "K42");
  assert.equal(read.pnr, "AB12CD");
  assert.equal(read.route, "Paris → Nice");
  assert.equal(read.travelerId, null);
  const linked = matchWalletPass(read, flights, travelers);
  assert.equal(linked.itemId, "aller");
  assert.equal(linked.travelerId, "camille");
});

test("un champ absent reste vide, et deux vols le même jour ne sont pas départagés", () => {
  const body = pass();
  const boarding = body.boardingPass as { auxiliaryFields: unknown[]; backFields: unknown[] };
  boarding.auxiliaryFields = [];
  boarding.backFields = [];
  const read = readWalletPass(zip([{ name: "pass.json", data: Buffer.from(JSON.stringify(body)), method: 0 }]));
  assert.ok(read);
  assert.equal(read.gate, null);
  assert.equal(read.pnr, null);
  assert.equal(read.seat, "12A");
  const ambiguous = matchWalletPass(read, [
    { id: "a", flightNumber: "AF7308", date: "2026-11-11", pnr: null },
    { id: "b", flightNumber: "AF7308", date: "2026-11-11", pnr: null },
  ], travelers);
  assert.equal(ambiguous.itemId, null);
  const wrongDay = matchWalletPass(read, [{ id: "autre", flightNumber: "AF7308", date: "2026-11-12", pnr: "AB12CD" }], travelers);
  assert.equal(wrongDay.itemId, null);
});

test("un PNR qui contredit le vol, ou un homonyme, ne rattache pas", () => {
  const read = readWalletPass(zip([{ name: "pass.json", data: Buffer.from(JSON.stringify(pass())), method: 0 }]));
  assert.ok(read);
  const clash = matchWalletPass(read, [{ id: "aller", flightNumber: "AF7308", date: "2026-11-11", pnr: "ZZ99ZZ" }], travelers);
  assert.equal(clash.itemId, null);
  const twins = matchWalletPass(read, flights, [
    { id: "a", firstName: "Camille", lastName: "Martin" },
    { id: "b", firstName: "Camille", lastName: "Martin" },
  ]);
  assert.equal(twins.travelerId, null);
});

test("un zip sans pass.json, ou un champ inventé, ne crée rien", () => {
  assert.equal(readWalletPass(zip([{ name: "logo.png", data: Buffer.from("png"), method: 0 }])), null);
  assert.equal(readWalletPass(new Uint8Array([1, 2, 3])), null);
  const stored = storedWalletPass({ flight: "AF7308", gate: "—", seat: "", travelerId: "pas-un-uuid" });
  assert.deepEqual(stored, {
    firstName: null,
    lastName: null,
    passenger: null,
    flight: "AF7308",
    date: null,
    seat: null,
    gate: null,
    pnr: null,
    route: null,
    travelerId: null,
  } satisfies WalletPassExtract);
});
