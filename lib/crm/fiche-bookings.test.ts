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

test("la fiche agence réunit le voyageur et les dossiers facturés, du plus proche au plus loin", () => {
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
  const merged = mergeFicheBookings([own], [own, jeremy], "2026-10-12");
  assert.deepEqual(
    merged.map((row) => row.id),
    ["marrakech", "aghouatim"]
  );
});

test("un dossier sans date passe après les séjours datés", () => {
  const merged = mergeFicheBookings(
    [
      { id: "open", customer_id: "cyril", start_date: null },
      { id: "dated", customer_id: "cyril", start_date: "2026-01-02" },
    ],
    [],
    "2026-10-12"
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

test("la fiche client agence ne montre pas le voyage d’un collaborateur", () => {
  const src = readFileSync(join(root, "app/admin/clients/[id]/page.tsx"), "utf8");
  assert.match(src, /\.eq\("billing_customer_id", id\)/);
  assert.match(src, /bookingIdsWhereClientTravels/);
  assert.match(src, /Les voyages des collaborateurs facturés sur ce compte ne figurent pas ici/);
  assert.equal(src.includes("Les séjours facturés sur ce compte figurent ici"), false);
  assert.equal(src.includes("otherAdminIds"), false);
  assert.match(src, /mergeFicheBookings/);
  assert.match(src, /ficheBookingTravelerLine/);
});

test("la migration ferme le carnet collaborateur sans toucher à la visibilité", () => {
  const sql = readFileSync(
    join(root, "supabase/migrations/20261124203000_payer_hides_collaborator_trips.sql"),
    "utf8"
  );
  assert.match(sql, /drop policy if exists crm_bookings_admin_collaborator/);
  assert.match(sql, /travels_on_booking/);
  assert.match(sql, /crm_bookings_as_traveler/);
  assert.equal(/update\s+public\.crm_bookings/i.test(sql), false);
  assert.equal(/set\s+visible_to_client/i.test(sql), false);
});
