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
  bookingSortParam,
  parseBookingSort,
  sortBookingsByProximity,
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

test("les tris disent ce qu’ils font : le défaut est du plus proche au plus loin", () => {
  assert.equal(BOOKING_SORTS.proche.proximity, true);
  assert.match(BOOKING_SORTS.proche.label, /plus proche/);
  assert.equal(BOOKING_SORTS["depart-asc"].ascending, true);
  assert.match(BOOKING_SORTS["depart-asc"].label, /plus ancien/);
  assert.equal(BOOKING_SORTS.depart.ascending, false);
  assert.match(BOOKING_SORTS.depart.label, /plus lointain/);
  assert.equal(bookingSortParam("proche"), null);
  assert.equal(bookingSortParam("depart"), "depart");
  assert.equal(parseBookingState("a-venir"), "a-venir");
});

test("les dossiers se classent du plus proche au plus loin", () => {
  const today = "2026-10-12";
  const row = (
    id: string,
    start: string | null,
    end: string | null,
    created = "2026-01-01T00:00:00.000Z"
  ) => ({ id, start_date: start, end_date: end, created_at: created });
  const sorted = sortBookingsByProximity(
    [
      row("past-old", "2026-01-01", "2026-01-05"),
      row("undated", null, null),
      row("future-far", "2026-12-01", "2026-12-05"),
      row("now-long", "2026-10-10", "2026-10-30"),
      row("past-new", "2026-10-01", "2026-10-11"),
      row("future-near", "2026-10-20", "2026-10-22"),
      row("now-short", "2026-10-11", "2026-10-13"),
      row("open", "2026-10-01", null),
      row("same-new", "2026-10-20", "2026-10-21", "2026-10-02T00:00:00.000Z"),
      row("same-old", "2026-10-20", "2026-10-21", "2026-09-01T00:00:00.000Z"),
    ],
    today
  );
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["now-short", "now-long", "open", "same-new", "same-old", "future-near", "future-far", "past-new", "past-old", "undated"]
  );
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
  assert.equal(parseBookingSort(undefined), "proche");
  assert.equal(parseBookingSort("depart"), "depart");
  assert.equal(parseBookingSort("montant"), "montant");
  assert.equal(parseBookingSort("hack"), "proche");
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
