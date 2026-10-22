import assert from "node:assert/strict";
import test from "node:test";
import { displayedStayAmount, ledgerCountedStayAmount } from "./displayed-stay";

const ticketing = (amount: number) => ({
  kind: "expense",
  amount,
  lifecycle: "active" as const,
  include_in_ledger: true,
  details: { auto_fee: "ticketing" },
});

const stay = (total: number) => ({
  id: "stay",
  status: "confirmed",
  total_amount: total,
  agency_commission: false,
  client_settles_stay: false,
  include_in_ledger: true,
});

/** TB-2026-0079 : 4 vols, 2 hôtels, 1 frais. Le retour n’a pas de prix. */
const items0079 = [
  { kind: "flight", amount: 1205.93, lifecycle: "active", include_in_ledger: true, details: { ticket_count: 1 } },
  { kind: "flight", amount: null, lifecycle: "active", include_in_ledger: false },
  { kind: "hotel", amount: 1182, lifecycle: "active", include_in_ledger: true },
  { kind: "hotel", amount: 1361.24, lifecycle: "active", include_in_ledger: true },
  ticketing(25),
  { kind: "flight", amount: null, lifecycle: "active", include_in_ledger: false },
  { kind: "flight", amount: null, lifecycle: "active", include_in_ledger: false },
];

/** TB-2026-0082 : vol + hôtel dans le total, billeterie et visa au livre. */
const items0082 = [
  { kind: "flight", amount: 977.88, lifecycle: "active", include_in_ledger: true, details: { ticket_count: 1 } },
  { kind: "flight", amount: null, lifecycle: "active", include_in_ledger: false, details: { ticket_count: 2 } },
  { kind: "hotel", amount: 994.08, lifecycle: "active", include_in_ledger: true },
  { kind: "flight", amount: null, lifecycle: "active", include_in_ledger: false, details: { ticket_count: 2 } },
  ticketing(25),
  { kind: "visa", amount: 25, lifecycle: "active", include_in_ledger: true },
];

/** TB-2026-0088 : le total stocké a déjà les billets × passagers. La billeterie est 50 €. */
const items0088 = [
  { kind: "flight", amount: 3495, lifecycle: "active", include_in_ledger: false, details: { ticket_count: 2 } },
  ticketing(50),
  { kind: "hotel", amount: 21842.11, lifecycle: "active", include_in_ledger: false },
  { kind: "hotel", amount: 17062.28, lifecycle: "active", include_in_ledger: false },
  { kind: "flight", amount: 3174, lifecycle: "active", include_in_ledger: false, details: { ticket_count: 2 } },
];

test("les trois dossiers comptent les cartes du livre de la même façon", () => {
  assert.equal(items0079.length, 7);
  assert.equal(ledgerCountedStayAmount(stay(3749.17), items0079, 1), 3774.17);
  assert.equal(ledgerCountedStayAmount(stay(1971.96), items0082, 1), 2021.96);
  assert.equal(ledgerCountedStayAmount(stay(52242.39), items0088, 2), 52292.39);
});

test("la billeterie automatique n’est pas comptée deux fois, le visa hors livre non plus", () => {
  assert.equal(displayedStayAmount(stay(1971.96), items0082, 1), 1996.96);
  assert.equal(ledgerCountedStayAmount(stay(1971.96), items0082, 1), 2021.96);
  const visaAside = items0082.map((item) =>
    item.kind === "visa" ? { ...item, include_in_ledger: false } : item
  );
  assert.equal(ledgerCountedStayAmount(stay(1971.96), visaAside, 1), 1996.96);
});

test("TB-2026-0100 : 611,20 et 611,19 sans frais font 1 222,39, pas 661,20", () => {
  const items = [
    {
      kind: "flight",
      amount: 611.2,
      start_at: "2026-10-08T18:45:00",
      lifecycle: "active",
      include_in_ledger: true,
      details: { from: "ORY", to: "RAK" },
    },
    { kind: "hotel", amount: null, lifecycle: "active", include_in_ledger: true },
    {
      kind: "flight",
      amount: 611.19,
      start_at: "2026-10-11T11:40:00",
      lifecycle: "active",
      include_in_ledger: true,
      details: { from: "RAK", to: "ORY" },
    },
  ];
  const stored = { ...stay(611.2), status: "draft" as const, fee_mode: "ticketing_off" };
  assert.equal(displayedStayAmount(stored, items, 2), 611.2);
  assert.equal(ledgerCountedStayAmount(stored, items, 2), 1222.39);
  assert.equal(displayedStayAmount({ ...stay(611.2), status: "draft" }, items, 2), 661.2);
});

test("un séjour réglé par le client ne reprend pas le total, il garde frais et visa inclus", () => {
  const settled = { ...stay(1971.96), client_settles_stay: true };
  assert.equal(ledgerCountedStayAmount(settled, items0082, 1), 50);
});
