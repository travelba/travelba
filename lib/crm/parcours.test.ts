import assert from "node:assert/strict";
import test from "node:test";
import { identityOverwriteWarning } from "./identity";
import { loyaltyFromCustomer, normalizeLoyaltyMap, normalizeLoyaltyNumber } from "./loyalty";
import { encoursCaption, formatEncours, formatMoney, jMinusLabel, postedLedgerTotals } from "./money";
import { needsAiCover, unsplashKeywordMatch } from "./covers";
import { vaultDocumentsForPerson } from "./trip-documents";
import { filterCreditTransfers, isCreditTransfer, type CrmTravelDocument } from "./types";

test("identity overwrite warns only when names differ", () => {
  assert.equal(
    identityOverwriteWarning({ first_name: "Benjamin", last_name: "Boukris" }, { first_name: "Benjamin", last_name: "Boukris" }),
    null
  );
  assert.match(
    identityOverwriteWarning({ first_name: "Ben", last_name: "B" }, { first_name: "Benjamin", last_name: "Boukris" }) || "",
    /passeport indique Benjamin Boukris/
  );
});

test("loyalty map keeps six programs", () => {
  assert.equal(normalizeLoyaltyNumber(" ab 12 "), "AB12");
  const mapped = normalizeLoyaltyMap({ flying_blue: "x", unknown: "nope" });
  assert.equal(mapped.flying_blue, "X");
  assert.equal("unknown" in mapped, false);
  const fromCustomer = loyaltyFromCustomer({ flying_blue: "FB1", loyalty: { miles_more: "MM" } });
  assert.equal(fromCustomer.flying_blue, "FB1");
  assert.equal(fromCustomer.miles_more, "MM");
});

test("encours shows the signed amount", () => {
  assert.equal(formatEncours(1200), `Encours ${formatMoney(1200)}`);
  assert.equal(formatEncours(-2400), `Encours ${formatMoney(-2400)}`);
});

test("encours caption follows the sign", () => {
  assert.equal(encoursCaption(-2400), "Reste à régler");
  assert.equal(encoursCaption(1200), "Avoir");
  assert.equal(encoursCaption(0), "Compte à jour");
});

test("J-minus uses the real start date", () => {
  assert.equal(jMinusLabel(null), null);
  const ymd = (offset: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  assert.equal(jMinusLabel(ymd(0)), "Aujourd’hui");
  assert.equal(jMinusLabel(ymd(18)), "J - 18");
  assert.equal(jMinusLabel(ymd(-2)), null);
});

test("agency ledger keeps only credit transfers", () => {
  assert.equal(isCreditTransfer({ direction: "credit", kind: "transfer" }), true);
  assert.equal(isCreditTransfer({ direction: "debit", kind: "transfer" }), false);
  assert.equal(isCreditTransfer({ direction: "credit", kind: "adjustment" }), false);
  assert.equal(isCreditTransfer({ direction: "debit", kind: "booking" }), false);
  const kept = filterCreditTransfers([
    { direction: "credit", kind: "transfer" },
    { direction: "debit", kind: "booking" },
    { direction: "debit", kind: "adjustment" },
    { direction: "credit", kind: "adjustment" },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].kind, "transfer");
});

test("ledger totals stay honest from posted movements", () => {
  const { credits, debits, settledPct } = postedLedgerTotals([
    { direction: "credit", amount: "9500" },
    { direction: "debit", amount: 14850 },
  ]);
  assert.equal(credits, 9500);
  assert.equal(debits, 14850);
  assert.equal(settledPct, 64);
});

test("Unsplash keyword match skips AI cover", () => {
  assert.ok(unsplashKeywordMatch({ destination: "Paris", title: "Week-end" }));
  assert.equal(needsAiCover({ destination: "Paris", title: "Week-end" }), false);
  assert.equal(needsAiCover({ destination: "Paris", title: "Week-end" }, true), true);
  const marrakech = unsplashKeywordMatch({
    destination: "Paris · Marrakech",
    title: "Voyage",
  });
  assert.ok(marrakech);
  assert.notEqual(
    marrakech,
    unsplashKeywordMatch({ destination: "Paris", title: "Week-end" })
  );
  assert.equal(
    unsplashKeywordMatch({ destination: "Avoriaz", title: "Avoriaz" }),
    "photo-1674043613875-eabfa5a45425"
  );
  assert.equal(unsplashKeywordMatch({ destination: "Xyzzy", title: "Inconnu" }), null);
  assert.equal(needsAiCover({ destination: "Xyzzy", title: "Inconnu" }), true);
});

test("vault documents for a person ignore trip clones", () => {
  const docs = [
    {
      id: "vault",
      customer_id: "c1",
      companion_id: null,
      booking_id: null,
      traveler_id: null,
      doc_type: "passport",
      number: "12AB",
      created_at: "2026-01-02",
    },
    {
      id: "trip",
      customer_id: "c1",
      companion_id: null,
      booking_id: "b1",
      traveler_id: "t1",
      doc_type: "passport",
      number: "12AB",
      created_at: "2026-01-03",
    },
  ] as CrmTravelDocument[];
  assert.deepEqual(vaultDocumentsForPerson(docs, null).map((doc) => doc.id), ["vault"]);
});
