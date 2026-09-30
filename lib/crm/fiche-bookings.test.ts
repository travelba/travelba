import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ficheBookingTravelerLine,
  ficheTravelerCaption,
  mergeFicheBookings,
} from "./fiche-bookings";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("la fiche agence réunit le voyageur et les dossiers facturés sur le compte", () => {
  const own = {
    id: "marrakech",
    customer_id: "cyril",
    start_date: "2026-11-01",
  };
  const jeremy = {
    id: "aghouatim",
    customer_id: "jeremy",
    start_date: "2026-12-01",
  };
  const merged = mergeFicheBookings([own], [own, jeremy]);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["aghouatim", "marrakech"]
  );
});

test("un dossier sans date passe après les séjours datés", () => {
  const merged = mergeFicheBookings(
    [
      { id: "open", customer_id: "cyril", start_date: null },
      { id: "dated", customer_id: "cyril", start_date: "2026-01-02" },
    ],
    []
  );
  assert.deepEqual(
    merged.map((row) => row.id),
    ["dated", "open"]
  );
});

test("le nom du voyageur n’apparaît que pour un collaborateur", () => {
  assert.equal(ficheTravelerCaption({ first_name: "Jérémy Moïse", last_name: "Samak" }), "Jérémy Samak");
  const names = new Map([["jeremy", "Jérémy Samak"]]);
  assert.equal(ficheBookingTravelerLine({ customer_id: "cyril" }, "cyril", names), null);
  assert.equal(
    ficheBookingTravelerLine({ customer_id: "jeremy" }, "cyril", names),
    "Voyage de Jérémy Samak"
  );
  assert.equal(
    ficheBookingTravelerLine({ customer_id: "inconnu" }, "cyril", names),
    "Voyage d’un collaborateur"
  );
});

test("la fiche client agence charge les dossiers facturés sur le compte", () => {
  const src = readFileSync(join(root, "app/admin/clients/[id]/page.tsx"), "utf8");
  assert.match(src, /\.eq\("billing_customer_id", id\)/);
  assert.match(src, /mergeFicheBookings/);
  assert.match(src, /ficheBookingTravelerLine/);
});
