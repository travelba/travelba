import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { ClientLedgerView } from "./client-ledger";
import type { AccountedLine, TripAccountingView } from "./trip-costs";
import type { CrmBookingItem } from "./types";
import {
  acceptArgent,
  mergeItemMoney,
  recallArgent,
  rememberArgent,
  resetArgentMemory,
  type ArgentHeld,
} from "./argent-live";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function line(partial: Partial<AccountedLine> & Pick<AccountedLine, "transactionId" | "label" | "sale">): AccountedLine {
  return {
    itemId: null,
    nature: "item",
    cost: 400,
    margin: partial.sale - 400,
    costs: [],
    ...partial,
  };
}

function view(lines: AccountedLine[], proposed: TripAccountingView["proposed"] = []): TripAccountingView {
  const sale = lines.reduce((sum, row) => sum + row.sale, 0);
  const cost = lines.reduce((sum, row) => sum + row.cost, 0);
  return {
    lines,
    unsold: [],
    totals: { sale, cost, margin: Math.round((sale - cost) * 100) / 100, unsoldCost: 0 },
    proposed,
    state: proposed.length ? "a_pointer" : "pointe",
    invoice: { number: null, printed: false, marginStale: false, byTransaction: {}, printedTotal: null },
    anomalies: [],
  };
}

function ledger(balance: number) {
  return { balanceValue: balance } as ClientLedgerView;
}

const card = (sale: number) => line({ transactionId: "tx-card", itemId: "card-1", label: "Rome → Tel Aviv", sale });
const commission = (sale: number) =>
  line({ transactionId: "tx-fee", itemId: null, nature: "fee", label: "Commission d’agence", sale, cost: 0, margin: sale });

describe("onglet Argent après un prix enregistré", () => {
  it("le prix, la commission, le vendu, la marge et l’encours suivent sans rechargement", () => {
    resetArgentMemory();
    const opened = acceptArgent(null, {
      revision: 1_000,
      layer: 0,
      accounting: view([card(1_000), commission(100)]),
      ledger: ledger(-1_100),
      accountLedger: ledger(-1_100),
      agencyCommission: true,
    });
    // Le rapprochement Stripe de la même page couvre l’encours, sans changer le prix.
    const withStripe = acceptArgent(opened, {
      revision: 1_000,
      layer: 1,
      ledger: ledger(-1_050),
      accountLedger: ledger(-1_050),
    });
    assert.equal(withStripe.accountLedger?.balanceValue, -1_050);
    assert.equal(withStripe.accounting?.totals.sale, 1_100);

    // Enregistrer 1 500 € : la lecture ciblée part après l’écriture.
    const saved = acceptArgent(withStripe, {
      revision: 2_000,
      layer: 2,
      keepProposed: true,
      accounting: view([card(1_500), commission(150)]),
      ledger: ledger(-1_650),
      accountLedger: ledger(-1_650),
      agencyCommission: true,
      items: [
        { id: "card-1", amount: 1500, include_in_ledger: true, kind: "flight", title: "Rome → Tel Aviv" } as CrmBookingItem,
      ],
    });

    // Changer d’onglet restaure la page d’ouverture (cache historique) et un Stripe déjà parti.
    const restoredPage = acceptArgent(saved, {
      revision: 1_000,
      layer: 0,
      accounting: view([card(1_000), commission(100)]),
      accountLedger: ledger(-1_100),
    });
    const lateStripe = acceptArgent(restoredPage, {
      revision: 1_000,
      layer: 1,
      accountLedger: ledger(-1_050),
    });

    assert.equal(lateStripe.accounting?.lines.find((row) => row.itemId === "card-1")?.sale, 1_500);
    assert.equal(lateStripe.accounting?.lines.find((row) => row.label === "Commission d’agence")?.sale, 150);
    assert.equal(lateStripe.accounting?.totals.sale, 1_650);
    assert.equal(lateStripe.accounting?.totals.margin, 1_250);
    assert.equal(lateStripe.accountLedger?.balanceValue, -1_650);
    assert.equal(lateStripe.items?.[0]?.amount, 1500);

    rememberArgent("dossier", lateStripe);
    const remounted = recallArgent("dossier");
    assert.ok(remounted);
    const afterRemount = acceptArgent(remounted, {
      revision: 1_000,
      layer: 0,
      accounting: view([card(1_000), commission(100)]),
      accountLedger: ledger(-1_100),
    });
    assert.equal(afterRemount.accounting?.totals.sale, 1_650);
    assert.equal(afterRemount.accountLedger?.balanceValue, -1_650);
  });

  it("la file des sorties déjà à l’écran reste quand le prix seul est relu", () => {
    const proposed = [{ id: "out-1" }] as unknown as TripAccountingView["proposed"];
    const opened = acceptArgent(null, {
      revision: 1,
      accounting: view([card(800)], proposed),
      accountLedger: ledger(-800),
    });
    const saved = acceptArgent(opened, {
      revision: 2,
      layer: 2,
      keepProposed: true,
      accounting: view([card(900)]),
    });
    assert.equal(saved.accounting?.proposed.length, 1);
    assert.equal(saved.accounting?.state, "a_pointer");
    assert.equal(saved.accounting?.lines[0]?.sale, 900);
    const kept = acceptArgent(saved, { revision: 3, layer: 2, accountLedger: null, ledger: null });
    assert.equal(kept.accountLedger?.balanceValue, -800);
  });

  it("une case, un ajout et un retrait se voient sur les lignes", () => {
    type Row = {
      id: string;
      amount: number;
      include_in_ledger: boolean;
      kind: string;
      title: string;
      details?: Record<string, unknown> | null;
    };
    const current: Row[] = [
      { id: "a", amount: 100, include_in_ledger: false, kind: "hotel", title: "Hôtel", details: { hotel_name: "Almenara" } },
      { id: "b", amount: 40, include_in_ledger: true, kind: "expense", title: "Transfert" },
    ];
    const fresh: Row[] = [
      { id: "a", amount: 180, include_in_ledger: true, kind: "hotel", title: "Hôtel", details: { room: "suite" } },
      { id: "c", amount: 25, include_in_ledger: true, kind: "expense", title: "Frais de billeterie" },
    ];
    const merged = mergeItemMoney(current, fresh);
    assert.deepEqual(
      merged.map((item) => [item.id, item.amount, item.include_in_ledger]),
      [
        ["a", 180, true],
        ["c", 25, true],
      ]
    );
    assert.equal(merged[0]?.details?.hotel_name, "Almenara");
    assert.equal(merged[0]?.details?.room, "suite");
  });

  it("l’écran relit /argent après l’enregistrement, sans s’en remettre au refresh de la page", () => {
    const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");
    const save = editor.slice(editor.indexOf("async function save("), editor.indexOf("async function setFace("));
    assert.match(save, /await refreshArgent\(\)/);
    const route = readFileSync(join(root, "app/api/admin/bookings/[id]/argent/route.ts"), "utf8");
    const loader = readFileSync(join(root, "lib/crm/dossier-argent.ts"), "utf8");
    assert.match(route, /loadDossierArgent/);
    assert.match(loader, /reconcile: false/);
    assert.match(loader, /skipOutgoingQueue: true/);
    assert.doesNotMatch(loader, /getStripe|revolut|pliantConfigured|mb3mInvoice/);
    const held: ArgentHeld = acceptArgent(null, { revision: 5, layer: 2, accountLedger: ledger(-10) });
    assert.equal(held.layer, 2);
  });
});
