import assert from "node:assert/strict";
import test from "node:test";
import { rankAdminSearch } from "./admin-search";

const booking = {
  id: "b1",
  reference: "TB-2026-0007",
  title: "Marrakech",
  destination: "Marrakech",
};

test("TB- ouvre le dossier, un nom ouvre la fiche", () => {
  const byRef = rankAdminSearch({
    query: "TB-2026-0007",
    byReference: [booking],
    byConfirmation: [],
    byHotel: [],
    customers: [{ id: "c1", first_name: "Camille", last_name: "Martin" }],
  });
  assert.equal(byRef.href, "/admin/reservations/b1");
  assert.equal(byRef.customers.length, 0);

  const byName = rankAdminSearch({
    query: "Martin",
    byReference: [],
    byConfirmation: [],
    byHotel: [],
    customers: [{ id: "c1", first_name: "Camille", last_name: "Martin" }],
  });
  assert.equal(byName.href, "/admin/clients/c1");
});

test("hôtel et confirmation ouvrent le dossier", () => {
  const hotel = rankAdminSearch({
    query: "Amanjena",
    byReference: [],
    byConfirmation: [],
    byHotel: [{ ...booking, id: "b2", title: "Amanjena" }],
    customers: [{ id: "c9", first_name: "Aman", last_name: "Jena" }],
  });
  assert.equal(hotel.href, "/admin/reservations/b2");

  const confirmation = rankAdminSearch({
    query: "ABC123",
    byReference: [],
    byConfirmation: [booking],
    byHotel: [],
    customers: [],
  });
  assert.equal(confirmation.href, "/admin/reservations/b1");
});
