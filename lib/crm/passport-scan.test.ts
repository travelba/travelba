import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { ExtractedIdentity } from "./identity";
import { chooseStreet, locateMrzBand, scanPassportBytes } from "./passport-scan";

test("a glare word after the street loses to the same street without it", () => {
  const street = chooseStreet(
    ["8 RUE DES OLIVIERS", "8 RUE DES OLIVIERS ABAES"],
    "8 RUE DES OLIVIERS\n8 RUE DES OLIVIERS ABAES"
  );
  assert.equal(street, "8 RUE DES OLIVIERS");
  const full = chooseStreet(
    ["18 RUE DU BOIS", "18 RUE DU BOIS DE LA FONTAINE"],
    "FONTAINE\nFONTAINE\n18 RUE DU BOIS DE LA FONTAINE"
  );
  assert.equal(full, "18 RUE DU BOIS DE LA FONTAINE");
});

/** Binaire système requis : le test est sauté explicitement, jamais en silence. */
function tesseractInstalled() {
  try {
    execFileSync("tesseract", ["--version"], { stdio: "ignore", timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

const tesseractAvailable = tesseractInstalled();

test("a turned passport is read from the ink lines before the bottom strip", () => {
  const source = readFileSync(new URL("./passport-scan.ts", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("async function readOriented"), source.indexOf("async function scanPage"));
  const located = body.indexOf("ocrLocatedMrz");
  const bottom = body.indexOf("bottomRect");
  assert.ok(located >= 0);
  assert.ok(bottom > located);
  const vision = readFileSync(new URL("./ocr-document.ts", import.meta.url), "utf8");
  const expand = vision.slice(vision.indexOf("async function expandPassportViews"), vision.indexOf("async function splitWidePages"));
  assert.match(expand, /\[\.\.\.pages\]/);
  assert.ok(expand.indexOf("[...pages]") < expand.indexOf("multiPassportCrops"));
});

test("the MRZ band sits above the page-edge shadow, not on the table", () => {
  const width = 800;
  const height = 600;
  const gray = new Uint8Array(width * height);
  gray.fill(210);
  const stroke = (y: number, x0: number, x1: number, thick: number, value: number) => {
    for (let row = y; row < y + thick && row < height; row += 1) {
      for (let x = x0; x < x1; x += 1) gray[row * width + x] = value;
    }
  };
  for (let x = 90; x < 700; x += 18) stroke(450, x, x + 8, 10, 25);
  for (let x = 90; x < 700; x += 18) stroke(495, x, x + 8, 10, 25);
  stroke(560, 40, 760, 36, 10);
  const band = locateMrzBand(gray, width, height);
  assert.ok(band);
  assert.ok(band.top < 450);
  assert.ok(band.top + band.height > 505);
  assert.ok(band.top + band.height < 560);
  assert.ok(band.left < 90);
  assert.ok(band.left + band.width > 700);
});

/**
 * Vrais passeports scannés : jamais dans le dépôt, ni les PDF ni les valeurs attendues.
 * Le dossier contient les PDF et `expected.json` (tableau d’`Expectation`), sur la machine
 * qui les a reçus. Sans eux, le test est sauté.
 */
const FIXTURE_DIR =
  process.env.TRAVELBA_PASSPORT_DIR ||
  "/home/ubuntu/.cursor/projects/workspace/uploads";

type Expectation = {
  /** Fin du nom de fichier du PDF dans FIXTURE_DIR. */
  suffix: string;
  people: Array<{
    first_name: string;
    last_name: string;
    number: string;
    nationality: string;
    issuing_country: string;
    birth_date: string;
    expires_on: string;
    sex: "F" | "M";
    issued_on?: string | null;
    place_of_birth?: string | null;
    authority?: string | null;
    personal_number?: string | null;
    address_line?: string | null;
    postal_code?: string | null;
    city?: string | null;
    /** Ordres de prénoms à ne jamais renvoyer (ligne hébraïque lue à l’envers, etc.). */
    not_first_names?: string[];
  }>;
};

function assertPerson(row: ExtractedIdentity, expected: Expectation["people"][number]) {
  assert.equal(row.first_name, expected.first_name);
  assert.equal(row.last_name, expected.last_name);
  assert.equal(row.number, expected.number);
  assert.equal(row.nationality, expected.nationality);
  assert.equal(row.issuing_country, expected.issuing_country);
  assert.equal(row.birth_date, expected.birth_date);
  assert.equal(row.expires_on, expected.expires_on);
  assert.equal(row.sex, expected.sex);
  assert.equal(row.valid, true);
  if (expected.issued_on !== undefined) assert.equal(row.issued_on, expected.issued_on);
  if (expected.place_of_birth) assert.equal(row.place_of_birth, expected.place_of_birth);
  if (expected.authority) {
    assert.equal((row.authority || "").replace("GÉNÉRAL", "GENERAL"), expected.authority);
  }
  if (expected.personal_number) assert.equal(row.personal_number, expected.personal_number);
  if (expected.address_line) assert.equal(row.address_line, expected.address_line);
  if (expected.postal_code) assert.equal(row.postal_code, expected.postal_code);
  if (expected.city) assert.equal(row.city, expected.city);
  for (const wrong of expected.not_first_names || []) assert.notEqual(row.first_name, wrong);
}

async function readExpectations(): Promise<Expectation[] | null> {
  try {
    const parsed = JSON.parse(await readFile(join(FIXTURE_DIR, "expected.json"), "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as Expectation[]) : null;
  } catch {
    return null;
  }
}

test(
  "real passport scans match their expected identities",
  { skip: tesseractAvailable ? false : "tesseract absent : binaire système requis (apt install tesseract-ocr)" },
  async (t) => {
    let names: string[] = [];
    try {
      names = await readdir(FIXTURE_DIR);
    } catch {
      t.skip("passport fixtures absent");
      return;
    }
    const expectations = await readExpectations();
    if (!expectations?.length) {
      t.skip("expected.json absent du dossier des passeports (TRAVELBA_PASSPORT_DIR)");
      return;
    }
    for (const spec of expectations) {
      const file = names.find((name) => name.endsWith(spec.suffix));
      if (!file) {
        t.skip(`missing ${spec.suffix}`);
        return;
      }
      const bytes = new Uint8Array(await readFile(join(FIXTURE_DIR, file)));
      const rows = await scanPassportBytes(bytes, "application/pdf", file);
      assert.equal(rows.length, spec.people.length, spec.suffix);
      for (const expected of spec.people) {
        const row = rows.find((item) => item.number === expected.number);
        assert.ok(row, spec.suffix);
        assertPerson(row, expected);
      }
    }
  }
);
