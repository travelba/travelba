import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_PAGE_SIZE,
  listHref,
  orSearchFilter,
  pageCount,
  pageOverflow,
  pageRange,
  paginationSummary,
  phoneSearchDigits,
  phoneSearchFilter,
  joinOrFilters,
  BOOKING_SORTS,
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

test("un numéro tapé retrouve le +33 stocké, les noms ne déclenchent pas la recherche téléphone", () => {
  assert.equal(phoneSearchDigits("06 12 34"), "61234");
  assert.equal(phoneSearchDigits("+33 6 12 34 56 78"), "612345678");
  assert.equal(phoneSearchDigits("0033612345678"), "612345678");
  assert.equal(phoneSearchDigits("TB-2024"), "");
  assert.equal(phoneSearchDigits("Dupont"), "");
  assert.equal(phoneSearchDigits("12"), "");
  assert.equal(phoneSearchFilter("06 12 34"), "phone.ilike.%61234%,phone_secondary.ilike.%61234%");
  assert.equal(phoneSearchFilter("Dupont"), "");
  assert.equal(joinOrFilters("a.ilike.%x%", "", "phone.ilike.%1%"), "a.ilike.%x%,phone.ilike.%1%");
});

test("les tris disent ce qu’ils font : asc = le plus proche d’abord", () => {
  assert.equal(BOOKING_SORTS["depart-asc"].ascending, true);
  assert.match(BOOKING_SORTS["depart-asc"].label, /plus proche/);
  assert.equal(BOOKING_SORTS.depart.ascending, false);
  assert.match(BOOKING_SORTS.depart.label, /plus lointain/);
  assert.equal(parseBookingState("a-venir"), "a-venir");
});

test("une page au-delà du total renvoie vers la dernière page", () => {
  assert.equal(pageOverflow(999, 312), 7);
  assert.equal(pageOverflow(7, 312), null);
  assert.equal(pageOverflow(2, 50), 1);
  assert.equal(pageOverflow(3, 0), null);
  assert.equal(pageOverflow(3, null), null);
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
