import assert from "node:assert/strict";
import test from "node:test";
import { parisIsoDate } from "./hotel-arrival";
import { bookingCardValidity } from "./manual-stay-card";
import { runWithMcpAccess } from "./mcp-auth";
import { createPliantCard, readPliantCard, type CardDeps } from "./mcp-pliant-card";
import { McpReadError } from "./mcp-passport";
import { McpWriteError } from "./mcp-write";

const PAN = "4242424242424242";
const CVV = "482";
const CLIENT = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const CARDS = { actor: "cartes", passport: false, cards: true };

type Row = Record<string, unknown>;

type State = {
  bookings: Row[];
  customers: Row[];
  travelers: Row[];
  cards: Row[];
  audits: Row[];
  registry: Row[];
  order: string[];
  issued: unknown[];
  secretCalls: number;
  failAudit: boolean;
  failCardInsert: boolean;
};

function baseState(): State {
  return {
    bookings: [
      {
        id: BOOKING,
        reference: "TB-2026-0082",
        title: "Tel-Aviv",
        customer_id: CLIENT,
        end_date: "2026-12-20",
      },
    ],
    customers: [{ id: CLIENT, first_name: "Camille", last_name: "Martin" }],
    travelers: [],
    cards: [],
    audits: [],
    registry: [],
    order: [],
    issued: [],
    secretCalls: 0,
    failAudit: false,
    failCardInsert: false,
  };
}

function fakeAdmin(state: State) {
  return {
    from(table: string) {
      const source =
        table === "crm_bookings"
          ? state.bookings
          : table === "crm_customers"
            ? state.customers
            : table === "crm_booking_travelers"
              ? state.travelers
              : table === "crm_booking_cards"
                ? state.cards
                : table === "crm_pliant_cards"
                  ? state.registry
                  : table === "crm_mcp_card_events"
                    ? state.audits
                    : [];
      const filters: { col: string; val: unknown }[] = [];
      const matched = () => source.filter((row) => filters.every((filter) => row[filter.col] === filter.val));
      const api = {
        select() {
          return api;
        },
        eq(col: string, val: unknown) {
          filters.push({ col, val });
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
        insert: async (payload: Row) => {
          if (table === "crm_booking_cards") {
            if (state.failCardInsert) return { error: { code: "23505" } };
            state.cards.push(payload);
            return { error: null };
          }
          if (table === "crm_mcp_card_events") {
            if (state.failAudit) return { error: { code: "XX000" } };
            state.audits.push(payload);
            state.order.push("audit");
            return { error: null };
          }
          return { error: null };
        },
        upsert: async (payload: Row) => {
          state.registry.push(payload);
          return { error: null };
        },
        then(
          onFulfilled: (value: { data: Row[]; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          return Promise.resolve({ data: matched(), error: null }).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
}

function deps(state: State): CardDeps {
  return {
    configured: () => true,
    issue: async (body) => {
      state.issued.push(body);
      state.order.push("issue");
      return { cardId: "pliant-visa-1" };
    },
    face: async () => ({ last4: "4242" }),
    secrets: async () => {
      state.secretCalls += 1;
      state.order.push("secrets");
      return { pan: PAN, expiry: "06/28", cvc: CVV };
    },
  };
}

function card(partial: Row = {}): Row {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    booking_id: BOOKING,
    pliant_card_id: "pliant-visa-1",
    label: "Visa",
    first_name: "Camille",
    last_name: "Martin",
    limit_cents: 1000,
    transaction_limit_cents: 1000,
    max_transaction_count: 1,
    currency: "EUR",
    status: "active",
    last4: "4242",
    ...partial,
  };
}

async function silence<T>(run: () => Promise<T>) {
  const original = console.error;
  const lines: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args);
  };
  try {
    return { value: await run(), lines };
  } finally {
    console.error = original;
  }
}

test("creer_carte_pliant émet une carte à usage unique rattachée au dossier, sans numéro", async () => {
  const state = baseState();
  const { value, lines } = await silence(() =>
    runWithMcpAccess(CARDS, () =>
      createPliantCard({ reference: "TB-2026-0082", nom: "Visa", plafond: "10" }, fakeAdmin(state), deps(state))
    )
  );
  assert.equal("pan" in value, false);
  assert.equal("cvv" in value, false);
  if (!("cree" in value) || !value.cree) assert.fail("carte non créée");
  assert.equal(value.nom, "Visa");
  assert.equal(value.titulaire, "Camille Martin");
  assert.equal(value.plafond, 10);
  assert.equal(value.devise, "EUR");
  assert.equal(value.transactions, 1);
  assert.equal(value.montant_transaction, 10);
  assert.equal(value.dossier_id, BOOKING);
  assert.equal(value.reference, "TB-2026-0082");
  assert.equal(value.quatre_derniers, "4242");
  assert.equal(value.carte_id, state.cards[0]?.id);

  const body = state.issued[0] as {
    label: string;
    cardConfig: string;
    maxTransactionCount: number;
    limit: { value: number; currency: string };
    transactionLimit: { value: number; currency: string };
    cardControls?: unknown;
    validTo: string;
  };
  assert.equal(body.label, "Visa");
  assert.equal(body.cardConfig, "PLIANT_VIRTUAL");
  assert.equal(body.maxTransactionCount, 1);
  assert.deepEqual(body.limit, { value: 1000, currency: "EUR" });
  assert.deepEqual(body.transactionLimit, { value: 1000, currency: "EUR" });
  assert.equal(Object.hasOwn(body, "cardControls"), false);
  assert.equal(body.validTo, bookingCardValidity(parisIsoDate(new Date()), "2026-12-20").validTo);

  assert.equal(state.cards[0]?.booking_id, BOOKING);
  assert.equal(state.cards[0]?.pliant_card_id, "pliant-visa-1");
  assert.equal(state.registry[0]?.booking_id, BOOKING);
  assert.equal(state.registry[0]?.customer_id, CLIENT);
  assert.equal(state.registry[0]?.limit_manual, true);
  assert.equal(state.registry[0]?.max_transaction_count, 1);

  const audit = state.audits.at(-1);
  assert.equal(audit?.kind, "creation");
  assert.equal(audit?.outcome, "ok");
  assert.equal(audit?.actor, "cartes");
  assert.equal(audit?.booking_id, BOOKING);
  assert.equal(audit?.reference, "TB-2026-0082");
  assert.equal(audit?.pliant_card_id, "pliant-visa-1");
  assert.equal(audit?.label, "Visa");
  assert.equal(audit?.limit_cents, 1000);
  assert.equal(audit?.currency, "EUR");
  const blob = JSON.stringify(state.audits) + JSON.stringify(lines);
  assert.equal(blob.includes(PAN), false);
  assert.equal(blob.includes(CVV), false);
});

test("sans le jeton carte, rien n’est émis et le refus est noté", async () => {
  const state = baseState();
  await assert.rejects(
    () =>
      runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
        createPliantCard({ reference: "TB-2026-0082", nom: "Visa", plafond: 10 }, fakeAdmin(state), deps(state))
      ),
    (err: unknown) => err instanceof McpWriteError && /pas autorisé/.test(err.message)
  );
  await assert.rejects(
    () =>
      runWithMcpAccess({ actor: "mcp", passport: false, cards: false }, () =>
        createPliantCard({ dossier_id: BOOKING, nom: "Visa", plafond: 10 }, fakeAdmin(state), deps(state))
      ),
    McpWriteError
  );
  assert.equal(state.issued.length, 0);
  assert.deepEqual(
    state.audits.map((row) => row.outcome),
    ["refuse", "refuse"]
  );
  assert.equal(JSON.stringify(state.audits).includes(PAN), false);
});

test("un plafond manquant ou trop large ne crée pas de carte", async () => {
  const missing = baseState();
  const result = await runWithMcpAccess(CARDS, () =>
    createPliantCard({ reference: "TB-2026-0082", nom: "Visa" }, fakeAdmin(missing), deps(missing))
  );
  assert.equal("message" in result && result.message, "Indiquez le plafond.");
  assert.equal(missing.issued.length, 0);
  assert.equal(missing.audits[0]?.outcome, "invalide");

  const wide = baseState();
  const refused = await runWithMcpAccess(CARDS, () =>
    createPliantCard({ reference: "TB-2026-0082", nom: "Visa", plafond: 100001, transactions: 21 }, fakeAdmin(wide), deps(wide))
  );
  assert.equal("message" in refused && refused.message, "Le nombre de transactions va de 1 à 20.");
  assert.equal(wide.issued.length, 0);
});

test("lire_carte_pliant ne renvoie que la carte du dossier, après le journal", async () => {
  const state = baseState();
  state.cards.push(card(), card({ id: "55555555-5555-4555-8555-555555555555", pliant_card_id: "pliant-hotel", label: "Hôtel" }));
  const choice = await runWithMcpAccess(CARDS, () =>
    readPliantCard({ reference: "TB-2026-0082" }, fakeAdmin(state), deps(state))
  );
  assert.equal("choix" in choice, true);
  assert.equal(state.secretCalls, 0);
  assert.equal(JSON.stringify(choice).includes(PAN), false);

  const revealed = await runWithMcpAccess(CARDS, () =>
    readPliantCard(
      { dossier_id: BOOKING, carte_id: "44444444-4444-4444-8444-444444444444" },
      fakeAdmin(state),
      deps(state)
    )
  );
  if (!("pan" in revealed)) assert.fail("numéro absent");
  assert.equal(revealed.pan, PAN);
  assert.equal(revealed.cvv, CVV);
  assert.equal(revealed.expiration, "06/28");
  assert.equal(revealed.titulaire, "Camille Martin");
  assert.equal(revealed.nom, "Visa");
  assert.equal(revealed.carte_id, "44444444-4444-4444-8444-444444444444");
  assert.equal(state.order.at(-2), "audit");
  assert.equal(state.order.at(-1), "secrets");
  const ok = state.audits.filter((row) => row.kind === "reveal" && row.outcome === "ok");
  assert.equal(ok.length, 1);
  assert.equal(ok[0]?.pliant_card_id, "pliant-visa-1");
  assert.equal(ok[0]?.label, "Visa");
  assert.equal(ok[0]?.limit_cents, 1000);
  assert.equal(JSON.stringify(state.audits).includes(PAN), false);
  assert.equal(JSON.stringify(state.audits).includes(CVV), false);

  const elsewhere = await runWithMcpAccess(CARDS, () =>
    readPliantCard({ dossier_id: BOOKING, carte_id: "99999999-9999-4999-8999-999999999999" }, fakeAdmin(state), deps(state))
  );
  assert.equal("introuvable" in elsewhere && elsewhere.introuvable, true);
  assert.equal(state.secretCalls, 1);
});

test("une carte bloquée ou un journal impossible ne livre pas le numéro", async () => {
  const locked = baseState();
  locked.cards.push(card({ status: "locked" }));
  const blocked = await runWithMcpAccess(CARDS, () =>
    readPliantCard({ reference: "TB-2026-0082" }, fakeAdmin(locked), deps(locked))
  );
  assert.equal("message" in blocked && blocked.message, "Cette carte est bloquée.");
  assert.equal(JSON.stringify(blocked).includes(PAN), false);
  assert.equal(locked.secretCalls, 0);
  assert.equal(locked.audits.at(-1)?.outcome, "invalide");

  const state = baseState();
  state.cards.push(card());
  state.failAudit = true;
  const { lines } = await silence(async () => {
    await assert.rejects(
      () => runWithMcpAccess(CARDS, () => readPliantCard({ reference: "TB-2026-0082" }, fakeAdmin(state), deps(state))),
      (err: unknown) => err instanceof McpReadError && err.message === "La consultation n’a pas pu être notée."
    );
  });
  assert.equal(state.secretCalls, 0);
  assert.equal(JSON.stringify(lines).includes(PAN), false);
});

test("le jeton passeport ne lit pas la carte", async () => {
  const state = baseState();
  state.cards.push(card());
  await assert.rejects(
    () =>
      runWithMcpAccess({ actor: "amadeus", passport: true }, () =>
        readPliantCard({ reference: "TB-2026-0082" }, fakeAdmin(state), deps(state))
      ),
    (err: unknown) => err instanceof McpReadError && /pas autorisé/.test(err.message)
  );
  assert.equal(state.secretCalls, 0);
  assert.equal(state.audits[0]?.outcome, "refuse");
  assert.equal(state.audits[0]?.kind, "reveal");
});

test("un refus Pliant ne laisse pas sortir le numéro", async () => {
  const state = baseState();
  const leaking = deps(state);
  leaking.issue = async () => {
    throw new Error(`refus ${PAN}`);
  };
  const { lines } = await silence(async () => {
    await assert.rejects(
      () =>
        runWithMcpAccess(CARDS, () =>
          createPliantCard({ reference: "TB-2026-0082", nom: "Visa", plafond: 10 }, fakeAdmin(state), leaking)
        ),
      (err: unknown) => {
        assert.ok(err instanceof McpWriteError);
        assert.equal(err.message.includes(PAN), false);
        return true;
      }
    );
  });
  const blob = JSON.stringify(lines) + JSON.stringify(state.audits);
  assert.equal(blob.includes(PAN), false);
  assert.equal(state.audits.at(-1)?.outcome, "erreur");
  assert.equal(state.cards.length, 0);
});
