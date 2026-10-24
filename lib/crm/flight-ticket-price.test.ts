import assert from "node:assert/strict";
import test from "node:test";
import { collectExtractIssues, ticketCountIssues } from "./booking-issues";
import { bookingTotalFromItems, itemSellingAmount } from "./bookings";
import { itemPriceLabel } from "./carnet";
import { parseTicketCountInput, statedTicketCount } from "./item-match";
import { formatMoney } from "./money";

test("un vol sans nombre de billets garde le prix global", () => {
  const flight = { kind: "flight" as const, amount: 1800, start_at: null, end_at: null, details: {} };
  assert.equal(statedTicketCount(flight), null);
  assert.equal(itemSellingAmount(flight), 1800);
  assert.equal(itemSellingAmount({ kind: "flight", amount: 1800, details: { ticket_count: null } }), 1800);
  assert.equal(itemSellingAmount({ kind: "flight", amount: 1800, details: { ticket_count: "" } }), 1800);
  assert.equal(
    bookingTotalFromItems([
      { kind: "flight", amount: 1800, start_at: "2026-08-01T08:00:00", details: { from: "CDG", to: "FCO" } },
    ]),
    1800
  );
  assert.equal(itemPriceLabel(flight, "EUR"), formatMoney(1800, "EUR"));
  assert.equal(itemPriceLabel(flight, "EUR")?.includes("×"), false);
});

test("un nombre saisi multiplie le prix unitaire, un champ vide ne force pas 1", () => {
  assert.equal(
    itemSellingAmount({ kind: "flight", amount: 250, details: { ticket_count: 5 } }),
    1250
  );
  assert.equal(
    itemPriceLabel(
      { kind: "flight", amount: 250, start_at: null, end_at: null, details: { ticket_count: 5 } },
      "EUR"
    ),
    `5 × ${formatMoney(250, "EUR")}`
  );
  assert.equal(parseTicketCountInput(""), null);
  assert.equal(parseTicketCountInput("  "), null);
  assert.equal(parseTicketCountInput("0"), null);
  assert.equal(parseTicketCountInput("abc"), null);
  assert.equal(parseTicketCountInput("3"), 3);
});

test("l’import n’avertit pas et ne bloque pas si le nombre de billets manque", () => {
  const extract = {
    document_status: "confirmed" as const,
    items: [{ title: "Paris → Rome", kind: "flight", details: {} }],
  };
  assert.deepEqual(ticketCountIssues(extract), []);
  const issues = collectExtractIssues(extract);
  assert.equal(issues.some((issue) => /billet/i.test(issue.message)), false);
});
