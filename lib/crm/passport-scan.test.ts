import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { ExtractedIdentity } from "./identity";
import { scanPassportBytes, tesseractAvailable } from "./passport-scan";

const FIXTURE_DIR =
  process.env.TRAVELBA_PASSPORT_DIR ||
  "/home/ubuntu/.cursor/projects/workspace/uploads";

type Expectation = {
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
  }>;
};

const EXPECTED: Expectation[] = [
  {
    suffix: "02ee.pdf",
    people: [
      {
        first_name: "Lyelle Jeanne Arlette",
        last_name: "Deddouch",
        number: "43325975",
        nationality: "IL",
        issuing_country: "IL",
        birth_date: "2011-02-10",
        expires_on: "2031-06-10",
        sex: "F",
        issued_on: "2026-06-11",
        place_of_birth: "FRANCE",
        authority: "JERUSALEM",
        personal_number: "3-4130259-4",
      },
    ],
  },
  {
    suffix: "e675.pdf",
    people: [
      {
        first_name: "Olga Eve",
        last_name: "Deddouch",
        number: "43328182",
        nationality: "IL",
        issuing_country: "IL",
        birth_date: "1976-06-18",
        expires_on: "2036-06-10",
        sex: "F",
        issued_on: "2026-06-11",
        place_of_birth: "FRANCE",
        authority: "JERUSALEM",
        personal_number: "3-4130258-6",
      },
    ],
  },
  {
    suffix: "b579.pdf",
    people: [
      {
        first_name: "Elina Rachel",
        last_name: "Deddouch",
        number: "43000652",
        nationality: "IL",
        issuing_country: "IL",
        birth_date: "2005-09-01",
        expires_on: "2036-04-08",
        sex: "F",
        issued_on: "2026-04-09",
        place_of_birth: "FRANCE",
        authority: "JERUSALEM",
        personal_number: "3-4130261-0",
      },
    ],
  },
  {
    suffix: "0c59.pdf",
    people: [
      {
        first_name: "Benoit",
        last_name: "Deddouch",
        number: "23AF45891",
        nationality: "FR",
        issuing_country: "FR",
        birth_date: "1977-12-14",
        expires_on: "2033-01-18",
        sex: "M",
        issued_on: "2023-01-19",
        place_of_birth: "PARIS 20E ARRONDISSEMENT",
        authority: "TEL AVIV - CONSULAT GENERAL DE FRANCE",
        address_line: "22 RUE MENDELE MOCHER SFORIM",
        postal_code: "4670921",
        city: "HERZLYA",
      },
    ],
  },
  {
    suffix: "20f7.pdf",
    people: [
      {
        first_name: "Orène Wilhem Benjamin",
        last_name: "Deddouch",
        number: "43450083",
        nationality: "IL",
        issuing_country: "IL",
        birth_date: "2007-08-17",
        expires_on: "2036-06-29",
        sex: "M",
        issued_on: null,
        authority: "JERUSALEM",
        personal_number: "3-4130260-2",
      },
      {
        first_name: "Orène Wilhem Benjamin",
        last_name: "Deddouch",
        number: "25HA65836",
        nationality: "FR",
        issuing_country: "FR",
        birth_date: "2007-08-17",
        expires_on: "2035-10-14",
        sex: "M",
        issued_on: "2025-10-15",
        place_of_birth: "PARIS 12E ARRONDISSEMENT",
        address_line: "22 RUE MENDELE MOCHER SFORIM",
        postal_code: "4670921",
        city: "HERZLYA",
      },
    ],
  },
];

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
  assert.notEqual(row.first_name, "Arlette Jeanne Lyelle");
  assert.notEqual(row.first_name, "Benjamin Wilhem Orène");
}

test("passport scans keep Latin given-name order", async (t) => {
  if (!(await tesseractAvailable())) {
    t.skip("tesseract absent");
    return;
  }
  let names: string[] = [];
  try {
    names = await readdir(FIXTURE_DIR);
  } catch {
    t.skip("passport fixtures absent");
    return;
  }
  const { readFile } = await import("node:fs/promises");
  for (const spec of EXPECTED) {
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
});
