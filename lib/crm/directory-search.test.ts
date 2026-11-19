import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  bookingSearchBlob,
  customerSearchBlob,
  directoryRank,
  directoryTokens,
  sortByDirectoryRank,
  suggestDirectory,
  tokenRank,
  type DirectoryBooking,
  type DirectoryCustomer,
} from "./directory-search";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const amin: DirectoryCustomer = {
  id: "amin",
  first_name: "Amin",
  last_name: "Khiari",
  company_name: "Bel Air Invest",
  email: "amin.khiari@belair.example",
  phone: "+33612345678",
  people: ["Lina Khiari"],
};

const amina: DirectoryCustomer = {
  id: "amina",
  first_name: "Amina",
  last_name: "Bernard",
  company_name: null,
  email: null,
  phone: null,
};

const benjamin: DirectoryCustomer = {
  id: "benjamin",
  first_name: "Benjamin",
  last_name: "Martin",
  company_name: null,
  email: null,
  phone: null,
};

test("un prénom exact passe devant un préfixe, puis un fragment", () => {
  assert.equal(directoryRank("amin", customerSearchBlob(amin)), 0);
  assert.equal(directoryRank("amin", customerSearchBlob(amina)), 1);
  assert.equal(directoryRank("amin", customerSearchBlob(benjamin)), 2);
  assert.equal(tokenRank("benjamin benjamin", "amin"), 2);
  const ordered = sortByDirectoryRank([benjamin, amina, amin], "amin", customerSearchBlob).map((row) => row.id);
  assert.deepEqual(ordered, ["amin", "amina", "benjamin"]);
});

test("le nom complet marche dans les deux ordres, sans accent, en ET", () => {
  const accent: DirectoryCustomer = { ...amin, first_name: "Amîn", last_name: "Khiari" };
  assert.equal(directoryRank("amin khiari", customerSearchBlob(accent)), 0);
  assert.equal(directoryRank("khiari amin", customerSearchBlob(accent)), 0);
  assert.equal(directoryRank("KHIARI", customerSearchBlob(accent)), 0);
  assert.equal(directoryRank("amin martin", customerSearchBlob(amin)), null);
  assert.deepEqual(directoryTokens("  Amin   Khiari "), ["amin", "khiari"]);
  assert.deepEqual(directoryTokens("a"), []);
});

test("société, e-mail, téléphone, référence et voyageur", () => {
  assert.equal(directoryRank("bel air", customerSearchBlob(amin)), 0);
  assert.equal(directoryRank("belair.example", customerSearchBlob(amin)), 0);
  assert.equal(directoryRank("06 12 34", customerSearchBlob(amin)), 1);
  assert.deepEqual(directoryTokens("06 12 34 56 78"), ["612345678"]);
  const booking: DirectoryBooking = {
    id: "b1",
    reference: "TB-2026-0042",
    title: "Tel Aviv",
    destination: "Tel Aviv",
    customer: amin,
    people: ["Nora Bernard"],
  };
  assert.equal(directoryRank("amin", bookingSearchBlob(booking)), 0);
  assert.equal(directoryRank("TB-2026-0042", bookingSearchBlob(booking)), 0);
  assert.equal(directoryRank("0042", bookingSearchBlob(booking)), 0);
  assert.equal(directoryRank("nora", bookingSearchBlob(booking)), 0);
  assert.equal(directoryRank("lina", bookingSearchBlob(booking)), 0);
  assert.equal(directoryRank("avoriaz", bookingSearchBlob(booking)), null);
});

test("Amin n’est plus écarté parce que son nom de famille arrive après cinq fragments", () => {
  const others = ["Albert", "Bernard", "Colin", "Denis", "Eric", "Fabien", "Gaston"].map((last, index) => ({
    id: `b${index}`,
    first_name: "Benjamin",
    last_name: last,
    company_name: null,
    email: null,
    phone: null,
  }));
  const hit = suggestDirectory(
    {
      customers: [...others, amin],
      bookings: [
        {
          id: "stay",
          reference: "TB-2026-0900",
          title: "Seychelles",
          destination: "Seychelles",
          customer_id: amin.id,
          start_date: "2026-08-01",
        },
      ],
      travelers: [{ id: "t1", booking_id: "stay", first_name: "Amin", last_name: "Khiari", is_account_holder: true }],
      companions: [{ id: "c1", customer_id: amin.id, first_name: "Lina", last_name: "Khiari", relationship: "Conjoint" }],
    },
    "amin",
    5
  );
  assert.equal(hit.clients[0]?.id, "amin");
  assert.equal(hit.clients.some((row) => row.id === "amin"), true);
  assert.equal(hit.dossiers[0]?.id, "stay");
  assert.equal(hit.voyageurs.some((row) => row.id === "t1"), false);
  const lina = suggestDirectory(
    {
      customers: [amin],
      companions: [{ id: "c1", customer_id: amin.id, first_name: "Lina", last_name: "Khiari", relationship: "Conjoint" }],
    },
    "lina",
    5
  );
  assert.equal(lina.clients[0]?.id, "amin");
  assert.equal(lina.voyageurs[0]?.id, "c1");
  assert.equal(lina.voyageurs[0]?.source, "companion");
});

test("la migration classe par pertinence et couvre les mêmes champs", () => {
  const sql = readFileSync(join(root, "supabase/migrations/20261119143000_omnibar_rank.sql"), "utf8");
  assert.match(sql, /À jouer à la main/);
  assert.match(sql, /crm_private\.is_staff\(\)/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /search_token_rank/);
  assert.match(sql, /'v', 2/);
  assert.match(sql, /phone/);
  assert.match(sql, /email/);
  assert.match(sql, /crm_booking_travelers/);
  assert.match(sql, /crm_travel_companions/);
  assert.match(sql, /crm_billing_companies/);
  assert.match(sql, /order by row\.rank/);
  assert.doesNotMatch(sql, /unaccent/);
  assert.doesNotMatch(sql, /grant execute on function public\.crm_omnibar_suggest\(text\) to anon/);
});
