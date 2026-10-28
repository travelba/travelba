import assert from "node:assert/strict";
import test from "node:test";
import { parsedItemsFromText } from "./ingest-parse";
import {
  addIsoMonths,
  cardMargin,
  commissionForCardWrite,
  commissionFromRate,
  commissionStatus,
  commissionWritePatch,
  countedCommission,
  defaultCommissionDue,
  liftCommissionFromDetails,
  parseCommissionRate,
  readPrintedCommission,
  stampPrintedCommission,
  toClientBookingItem,
} from "./supplier-commission";

test("la commission reçue remplace l’attendue, sans montant inventé", () => {
  assert.deepEqual(countedCommission({ attendue: 120, recue: null }), { amount: 120, kind: "attendue" });
  assert.deepEqual(countedCommission({ attendue: 120, recue: 80 }), { amount: 80, kind: "recue" });
  assert.deepEqual(countedCommission({ attendue: 120, recue: 0 }), { amount: 0, kind: "recue" });
  assert.deepEqual(countedCommission({}), { amount: 0, kind: "aucune" });
});

test("marge = vente − achat + commission, et les 12 % du net la comptent", () => {
  const estimated = cardMargin({ sale: 1000, purchase: 900, commission: { attendue: 50, recue: null } });
  assert.equal(estimated.direct, 100);
  assert.equal(estimated.commission, 50);
  assert.equal(estimated.margin, 150);
  assert.equal(estimated.kind, "attendue");
  assert.equal(estimated.belowMinimum, false);
  const received = cardMargin({ sale: 1000, purchase: 900, commission: { attendue: 50, recue: 20 } });
  assert.equal(received.margin, 120);
  assert.equal(received.kind, "recue");
  const short = cardMargin({ sale: 1000, purchase: 1000, commission: { attendue: 50, recue: null } });
  assert.equal(short.margin, 50);
  assert.equal(short.belowMinimum, true);
  const foreign = cardMargin({ sale: null, purchase: null, commission: { attendue: 40, recue: null } });
  assert.equal(foreign.direct, null);
  assert.equal(foreign.commission, 40);
  assert.equal(foreign.margin, null);
});

test("date prévue : fin de carte + un mois, y compris un 31", () => {
  assert.equal(addIsoMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(defaultCommissionDue("2026-08-14T12:00:00"), "2026-09-14");
  assert.equal(defaultCommissionDue(null), null);
});

test("taux 10, 10 % ou 0,10, pas un taux par défaut", () => {
  assert.equal(parseCommissionRate("10 %"), 0.1);
  assert.equal(parseCommissionRate(10), 0.1);
  assert.equal(parseCommissionRate("0,10"), 0.1);
  assert.equal(parseCommissionRate(""), null);
  assert.equal(parseCommissionRate(0), null);
  assert.equal(commissionFromRate(0.1, 800), 80);
  assert.equal(commissionFromRate(null, 800), null);
});

test("la confirmation imprime le montant ou le taux, sinon rien", () => {
  assert.deepEqual(readPrintedCommission("Commission: 120.00 EUR\nTotal 900"), { attendue: 120, taux: null });
  assert.deepEqual(readPrintedCommission("IATA commission 8,5 %"), { attendue: null, taux: 0.085 });
  assert.deepEqual(readPrintedCommission("Your commission: €85.50"), { attendue: 85.5, taux: null });
  assert.deepEqual(readPrintedCommission("Commission d’agence 10 %"), { attendue: null, taux: null });
  assert.deepEqual(readPrintedCommission("Petit-déjeuner inclus"), { attendue: null, taux: null });
  const stamped = stampPrintedCommission(
    [{ kind: "hotel", end_at: "2026-08-14", details: { document_amount: 800, document_currency: "EUR" } as Record<string, unknown> }],
    "Commission 10 %"
  );
  assert.equal(stamped[0]?.details?.commission_taux, 0.1);
  assert.equal(stamped[0]?.details?.commission_attendue, 80);
  assert.equal(stamped[0]?.details?.commission_date_prevue, "2026-09-14");
  const two = stampPrintedCommission(
    [
      { kind: "hotel", end_at: "2026-08-14", details: {} as Record<string, unknown> },
      { kind: "hotel", end_at: "2026-08-20", details: {} as Record<string, unknown> },
    ],
    "Commission: 40 EUR"
  );
  assert.equal(two[0]?.details?.commission_attendue, undefined);
  assert.equal(two[1]?.details?.commission_attendue, undefined);
});

test("une confirmation d’hôtel remplit la commission, une lettre sans commission non", () => {
  const withCommission = parsedItemsFromText(`RESERVATION CONFIRMATION
Check In 14-SEP-26
Check Out 18-SEP-26
stay at The Leela Mumbai
Commission: 120.00 EUR
`);
  const hotel = withCommission.items.find((item) => item.kind === "hotel");
  assert.equal(hotel?.details?.commission_attendue, 120);
  const plain = parsedItemsFromText(`RESERVATION CONFIRMATION
Check In 14-SEP-26
Check Out 18-SEP-26
stay at The Leela Mumbai
`);
  assert.equal(plain.items.find((item) => item.kind === "hotel")?.details?.commission_attendue, undefined);
});

test("l’enregistrement sort la commission des détails et pose la date", () => {
  const lifted = liftCommissionFromDetails(
    { hotel_name: "Ritz", commission_taux: 0.1, document_amount: 500, document_currency: "EUR" },
    "2026-11-02",
    null
  );
  assert.equal(lifted.present, true);
  assert.equal(lifted.columns.commission_attendue, 50);
  assert.equal(lifted.columns.commission_date_prevue, "2026-12-02");
  assert.equal(lifted.details.commission_attendue, undefined);
  assert.equal(lifted.details.hotel_name, "Ritz");
  const empty = liftCommissionFromDetails({ hotel_name: "Ritz" }, "2026-11-02", null);
  assert.equal(empty.present, false);
  assert.equal(empty.columns.commission_attendue, null);
});

test("l’écriture vide efface, l’absence ne change rien", () => {
  assert.deepEqual(commissionWritePatch({ titre: "Ritz" }, "2026-08-01"), { columns: null });
  const written = commissionWritePatch({ commission_attendue: "90" }, "2026-08-01");
  assert.equal("columns" in written && written.columns && written.columns.commission_attendue, 90);
  assert.equal("columns" in written && written.columns && written.columns.commission_date_prevue, "2026-09-01");
  const cleared = commissionWritePatch({ commission_attendue: "" }, "2026-08-01", {
    attendue: 90,
    taux: null,
    datePrevue: "2026-09-01",
    recue: null,
    recueLe: null,
  });
  assert.equal("columns" in cleared && cleared.columns && cleared.columns.commission_attendue, null);
  const invalid = commissionWritePatch({ commission_recue: "abc" }, null);
  assert.equal("error" in invalid, true);
});

test("la carte envoyée au client ne porte ni commission ni marge", () => {
  const hidden = toClientBookingItem({
    id: "card",
    title: "Ritz",
    commission_attendue: 120,
    commission_taux: 0.1,
    commission_date_prevue: "2026-09-01",
    commission_recue: 80,
    commission_recue_le: "2026-09-02",
    details: { hotel_name: "Ritz", commission_attendue: 120 },
  });
  const packed = JSON.stringify(hidden);
  assert.equal(packed.includes("commission"), false);
  assert.equal(packed.includes("120"), false);
  assert.equal(hidden.details?.hotel_name, "Ritz");
});

test("file : attendue, en retard, reçue", () => {
  const base = { attendue: 10, taux: null, datePrevue: "2026-10-01", recue: null, recueLe: null };
  assert.equal(commissionStatus(base, "2026-09-01"), "attendue");
  assert.equal(commissionStatus(base, "2026-10-02"), "en_retard");
  assert.equal(commissionStatus({ ...base, recue: 10, recueLe: "2026-10-03" }, "2026-10-04"), "recue");
  assert.equal(commissionStatus({ attendue: null, taux: null, datePrevue: null, recue: null, recueLe: null }, "2026-10-01"), null);
});

test("l’écriture de carte reprend le corps et retire le JSON", () => {
  const saved = commissionForCardWrite(
    { commission_recue: 70, commission_recue_le: "2026-10-03" },
    { commission_attendue: 90, room: "Deluxe" },
    "2026-09-01"
  );
  assert.equal("error" in saved, false);
  if ("error" in saved) return;
  assert.equal(saved.columns.commission_recue, 70);
  assert.equal(saved.columns.commission_attendue, 90);
  assert.equal(saved.details.room, "Deluxe");
  assert.equal(saved.details.commission_attendue, undefined);
});
