import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConciergeDossier } from "@/lib/crm/whatsapp-concierge";
import { fixtureWebProvider } from "@/lib/crm/concierge-engine-web";
import { storeReservationSimulation } from "@/lib/crm/concierge-reservation-store";
import {
  clampLiveBatchSize,
  remainingSimulationBudget,
  runSimulationBatch,
  selectSimulationBatch,
  type StoredSimulationRow,
} from "@/lib/crm/concierge-reservation-batch";

const NOW = new Date("2026-11-20T08:00:00.000Z");

function dossier() {
  return buildConciergeDossier({
    firstName: "Camille",
    language: "fr",
    bookings: [
      {
        id: "stay-rome",
        reference: "TB-2026-8801",
        title: "Rome",
        destination: "Rome",
        start_date: "2026-12-04",
        end_date: "2026-12-08",
        currency: "EUR",
        total_amount: 0,
        visible_to_client: true,
        prices_visible: false,
        cover_image_path: null,
        notes_client: null,
        share_code: null,
      },
    ],
    items: [
      {
        id: "fl-out",
        booking_id: "stay-rome",
        kind: "flight",
        title: "Paris → Rome",
        start_at: "2026-12-04T10:30:00",
        end_at: "2026-12-04T12:40:00",
        amount: null,
        visible_to_client: true,
        details: {
          flight_number: "AF1204",
          city_from: "Paris",
          city_to: "Rome",
          from: "CDG",
          to: "FCO",
          terminal: "2E",
          departure_timezone: "Europe/Paris",
          passport_number: "12AB34567",
        },
      },
      {
        id: "htl",
        booking_id: "stay-rome",
        kind: "hotel",
        title: "Hotel de Test",
        start_at: "2026-12-04T15:00:00",
        end_at: "2026-12-08T11:00:00",
        amount: null,
        visible_to_client: true,
        details: { hotel_name: "Hotel de Test", city: "Rome", board: "petit-déjeuner" },
      },
    ],
    balances: [{ currency: "EUR", balance: -80 }],
  });
}

function cases(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    reference: `TB-2026-${8801 + index}`,
    dossier: dossier(),
  }));
}

function persist(writer: {
  from(table: string): {
    upsert(
      row: Record<string, unknown> | Record<string, unknown>[],
      options?: { onConflict?: string }
    ): Promise<{ error: { message?: string; code?: string } | null }>;
  };
}) {
  return async (row: Parameters<typeof storeReservationSimulation>[1]["rows"][number]) => {
    const saved = await storeReservationSimulation(writer, { batchKey: "lot", batchId: "batch-1", rows: [row] });
    if (saved.pending) return { ok: false, pending: true, stored: 0 };
    if (saved.error) return { ok: false, stored: 0 };
    return { ok: true, stored: saved.stored };
  };
}

function marks(rows: Record<string, unknown>[]): StoredSimulationRow[] {
  return rows.map((row) => ({
    booking_reference: String(row.booking_reference),
    kind: String(row.kind),
    mode: String(row.mode),
    calls: Number(row.calls || 0),
  }));
}

test("le lot prend 2 ou 3 dossiers et saute ceux déjà enregistrés", () => {
  const references = Array.from({ length: 20 }, (_, index) => `TB-${index}`);
  assert.equal(clampLiveBatchSize(undefined), 2);
  assert.equal(clampLiveBatchSize(1), 2);
  assert.equal(clampLiveBatchSize(3), 3);
  assert.equal(clampLiveBatchSize(20), 3);
  const first = selectSimulationBatch({ references, complets: [], offset: 0, taille: 2 });
  assert.deepEqual(first.batch, ["TB-0", "TB-1"]);
  assert.equal(first.restants.length, 18);
  const next = selectSimulationBatch({ references, complets: first.batch, offset: 0, taille: 2 });
  assert.deepEqual(next.batch, ["TB-2", "TB-3"]);
  const fromOffset = selectSimulationBatch({ references, complets: ["TB-0"], offset: 4, taille: 2 });
  assert.deepEqual(fromOffset.batch, ["TB-4", "TB-5"]);
  const three = selectSimulationBatch({ references, complets: [], offset: 0, taille: 3 });
  assert.deepEqual(three.batch, ["TB-0", "TB-1", "TB-2"]);
  const listed = selectSimulationBatch({
    references,
    complets: ["TB-1"],
    dossiers: ["TB-5", "TB-9", "TB-1", "hors-liste"],
    taille: 3,
  });
  assert.deepEqual(listed.batch, ["TB-5", "TB-9"]);
  const stale = selectSimulationBatch({ references, complets: references.slice(18), offset: 18, taille: 2 });
  assert.deepEqual(stale.batch, ["TB-0", "TB-1"]);
  assert.equal(remainingSimulationBudget(200, 150), 50);
  assert.equal(remainingSimulationBudget(200, 200), 0);
  assert.equal(remainingSimulationBudget(900, 0), 200);
  assert.equal(remainingSimulationBudget(30, 10), 20);
});

test("chaque demande est écrite avant la suivante", async () => {
  const seen: { conflict?: string; rows: Record<string, unknown>[] }[] = [];
  let calls = 0;
  const writer = {
    from() {
      return {
        upsert: async (rows: Record<string, unknown>[], options?: { onConflict?: string }) => {
          calls += 1;
          if (calls === 3) return { error: { message: "insert" } };
          seen.push({ conflict: options?.onConflict, rows });
          return { error: null };
        },
      };
    },
  };
  const outcome = await runSimulationBatch({
    cases: cases(1),
    stored: [],
    live: false,
    modelBudget: 0,
    askBudget: 8,
    now: NOW,
    style: "net",
    onAsk: persist(writer),
  });
  assert.equal(outcome.error, "insert");
  assert.equal(outcome.demandes, 2);
  assert.equal(outcome.enregistres, 4);
  assert.equal(outcome.suite, false);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].conflict, "batch_key,booking_reference,kind,mode");
  assert.equal(seen[0].rows.length, 2);
  assert.equal(JSON.stringify(seen).includes("12AB34567"), false);
  assert.equal(seen[0].rows[0].kind === seen[1].rows[0].kind, false);
});

test("la reprise ne refait pas les demandes enregistrées et le budget se cumule", async () => {
  let calls = 0;
  const engine = async () => {
    calls += 1;
    return { text: "Votre vol AF1204 part à 10h30. Je transmets à l’agence.", usage: { inputTokens: 4, outputTokens: 2 } };
  };
  const blocked = await runSimulationBatch({
    cases: cases(1),
    stored: [
      { booking_reference: "TB-2026-8801", kind: "heure", mode: "router", calls: 0 },
      { booking_reference: "TB-2026-8801", kind: "heure", mode: "engine", calls: 200 },
    ],
    live: true,
    modelBudget: 200,
    askBudget: 8,
    now: NOW,
    style: "net",
    web: fixtureWebProvider(),
    engineGenerate: engine,
    onAsk: async () => ({ ok: true, stored: 2 }),
  });
  assert.equal(calls, 0);
  assert.equal(blocked.budgetEpuise, true);
  assert.equal(blocked.suite, false);
  assert.equal(blocked.appelsCumules, 200);

  calls = 0;
  const captured: Record<string, unknown>[] = [];
  const writer = {
    from() {
      return {
        upsert: async (rows: Record<string, unknown>[]) => {
          captured.push(...rows);
          return { error: null };
        },
      };
    },
  };
  const first = await runSimulationBatch({
    cases: cases(1),
    stored: [],
    live: true,
    modelBudget: 2,
    askBudget: 8,
    now: NOW,
    style: "net",
    web: fixtureWebProvider(),
    engineGenerate: engine,
    onAsk: persist(writer),
  });
  assert.equal(first.demandes, 2);
  assert.equal(first.appels, 2);
  assert.equal(first.budgetEpuise, true);
  assert.equal(first.suite, false);
  assert.equal(calls, 2);
  const kinds = new Set(captured.filter((row) => row.mode === "engine").map((row) => String(row.kind)));
  assert.equal(kinds.size, 2);

  calls = 0;
  const secondKinds: string[] = [];
  const second = await runSimulationBatch({
    cases: cases(1),
    stored: marks(captured),
    live: true,
    modelBudget: 4,
    askBudget: 8,
    now: NOW,
    style: "net",
    web: fixtureWebProvider(),
    engineGenerate: engine,
    onAsk: async (row) => {
      secondKinds.push(row.kind);
      return { ok: true, stored: 2 };
    },
  });
  assert.equal(second.demandes, 2);
  assert.equal(second.appels, 2);
  assert.equal(second.appelsCumules, 4);
  assert.equal(calls, 2);
  assert.equal(secondKinds.some((kind) => kinds.has(kind)), false);
  assert.equal(JSON.stringify(captured).includes("12AB34567"), false);
});

test("un lot live s’arrête avant 300 s et le suivant reprend", async () => {
  const played = await runSimulationBatch({
    cases: cases(4),
    stored: [],
    live: true,
    modelBudget: 200,
    askBudget: 40,
    taille: 2,
    now: NOW,
    style: "net",
    web: fixtureWebProvider(),
    engineGenerate: async () => ({ text: "Je transmets à l’agence.", usage: { inputTokens: 1, outputTokens: 1 } }),
    onAsk: async () => ({ ok: true, stored: 2 }),
  });
  assert.equal(played.joues, 2);
  assert.equal(played.dossiersFaits, 2);
  assert.equal(played.suite, true);
  assert.equal(played.offset, 2);

  let now = 0;
  const cut = await runSimulationBatch({
    cases: cases(1),
    stored: [],
    live: true,
    modelBudget: 200,
    askBudget: 8,
    now: NOW,
    style: "net",
    web: fixtureWebProvider(),
    clock: () => now,
    deadlineMs: 150_000,
    engineGenerate: async () => ({ text: "Je transmets à l’agence.", usage: { inputTokens: 1, outputTokens: 1 } }),
    onAsk: async () => {
      now += 100_000;
      return { ok: true, stored: 2 };
    },
  });
  assert.equal(cut.demandes, 2);
  assert.equal(cut.suite, true);
  assert.equal(cut.dossiersFaits, 0);
  assert.equal(cut.budgetEpuise, false);
});
