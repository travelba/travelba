import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_PAGE_SIZE,
  listHref,
  orSearchFilter,
  pageCount,
  pageRange,
  paginationSummary,
  parseBookingSort,
  parseBookingState,
  parseBookingStatus,
  parseClientFilter,
  parseLoadMore,
  parsePage,
  searchPattern,
} from "./admin-list";

test("la page se lit dans l’URL et borne la plage Supabase", () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("abc"), 1);
  assert.equal(parsePage(["3", "4"]), 3);
  assert.deepEqual(pageRange(1), { from: 0, to: 49 });
  assert.deepEqual(pageRange(3), { from: 100, to: 149 });
  assert.equal(pageCount(312), 7);
  assert.equal(pageCount(0), 1);
  assert.equal(ADMIN_PAGE_SIZE, 50);
});

test("le résumé dit « 1-50 sur 312 »", () => {
  assert.equal(paginationSummary(1, 312), "1-50 sur 312");
  assert.equal(paginationSummary(7, 312), "301-312 sur 312");
  assert.equal(paginationSummary(2, 51), "51 sur 51");
  assert.equal(paginationSummary(1, 0), "0 sur 0");
});

test("la recherche devient un motif ilike sans casser la syntaxe PostgREST", () => {
  assert.equal(searchPattern("  Dupont, Marie (TB-2024)  "), "%Dupont Marie TB-2024%");
  assert.equal(searchPattern("%_"), "");
  assert.equal(searchPattern(undefined), "");
  assert.equal(
    orSearchFilter("%rome%", ["reference", "title"], "customer_id", ["a", "b"]),
    "reference.ilike.%rome%,title.ilike.%rome%,customer_id.in.(a,b)"
  );
  assert.equal(orSearchFilter("%rome%", ["reference"], "customer_id", []), "reference.ilike.%rome%");
});

test("les filtres inconnus retombent sur la valeur par défaut", () => {
  assert.equal(parseBookingState("montre"), "montre");
  assert.equal(parseBookingState("supprime"), null);
  assert.equal(parseBookingStatus("confirmed"), "confirmed");
  assert.equal(parseBookingStatus("brouillon"), null);
  assert.equal(parseBookingSort(undefined), "depart");
  assert.equal(parseBookingSort("montant"), "montant");
  assert.equal(parseBookingSort("hack"), "depart");
  assert.equal(parseClientFilter("veille"), "veille");
  assert.equal(parseClientFilter("x"), null);
});

test("« Charger plus » avance par pas et reste borné", () => {
  assert.equal(parseLoadMore(undefined, 500, 4000), 500);
  assert.equal(parseLoadMore("12", 500, 4000), 500);
  assert.equal(parseLoadMore("1000", 500, 4000), 1000);
  assert.equal(parseLoadMore("1200", 500, 4000), 1500);
  assert.equal(parseLoadMore("99999", 500, 4000), 4000);
});

test("les liens de pagination gardent les filtres", () => {
  assert.equal(listHref("/admin/reservations", { q: "rome", etat: null, tri: "depart" }, 2), "/admin/reservations?q=rome&tri=depart&page=2");
  assert.equal(listHref("/admin/reservations", { q: "" }, 1), "/admin/reservations");
  assert.equal(listHref("/admin/clients", { page: 4 }, 1), "/admin/clients");
});
