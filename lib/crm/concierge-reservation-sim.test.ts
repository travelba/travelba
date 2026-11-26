import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildConciergeDossier } from "@/lib/crm/whatsapp-concierge";
import { readReservationCases } from "@/lib/crm/concierge-reservation-load";
import { storeReservationSimulation } from "@/lib/crm/concierge-reservation-store";
import {
  ASKS_PER_BOOKING,
  diversifyClientText,
  generateReservationAsks,
  runReservationSimulation,
  simulationBatchKey,
  simulationCallEstimate,
  stripReservationIdentity,
  summarizeReservationResults,
} from "@/lib/crm/concierge-reservation-sim";

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

test("les demandes viennent du dossier et n’emportent pas de pièce d’identité", () => {
  const asks = generateReservationAsks(dossier(), { reference: "TB-2026-8801", now: NOW, style: "net" });
  const kinds = asks.map((ask) => ask.kind);
  assert.ok(kinds.includes("heure"));
  assert.ok(kinds.includes("devis"));
  assert.ok(kinds.includes("annulation"));
  assert.ok(kinds.includes("checkin"));
  assert.equal(asks.length, ASKS_PER_BOOKING);
  const blob = asks.map((ask) => ask.turns.map((turn) => turn.clientText).join(" ")).join("\n");
  assert.equal(blob.includes("12AB34567"), false);
  assert.equal(/\b\d{6,}\b/.test(blob), false);
  const cleaned = stripReservationIdentity({ details: { passport_number: "12AB34567", flight_number: "AF1204" } });
  assert.equal(cleaned.details.passport_number, undefined);
  assert.equal(cleaned.details.flight_number, "AF1204");
});

test("le moteur et le routeur sont notés sans envoi", async () => {
  const results = await runReservationSimulation({
    cases: [{ reference: "TB-2026-8801", dossier: dossier() }],
    now: NOW,
    style: "net",
    maxAsks: 8,
  });
  assert.equal(results.length, 8);
  const heure = results.find((row) => row.kind === "heure");
  const devis = results.find((row) => row.kind === "devis");
  const annulation = results.find((row) => row.kind === "annulation");
  assert.ok(heure);
  assert.match(heure.engine.reply, /AF1204/);
  assert.match(heure.engine.reply, /10h30/);
  assert.ok(devis);
  assert.equal(/solde/i.test(devis.engine.reply), false);
  assert.ok(annulation);
  assert.equal(/j’ai annulé|j'ai annulé/i.test(annulation.engine.reply), false);
  assert.equal(annulation.engine.ok, true);
  const summary = summarizeReservationResults(results);
  assert.equal(summary.total, 8);
  assert.ok(summary.byPhase.length > 0);
  assert.ok(summary.byKind.some((row) => row.kind === "devis"));
  assert.ok(summary.worst.length > 0);
});

test("le budget et la diversification s’arrêtent", async () => {
  const calls: string[] = [];
  const limited = await runReservationSimulation({
    cases: [{ reference: "TB-2026-8801", dossier: dossier() }],
    now: NOW,
    style: "net",
    budget: 2,
    diversify: async (text) => {
      calls.push(text);
      return `${text} merci`;
    },
    diversifyBudget: 1,
  });
  assert.equal(limited.length, 2);
  assert.equal(calls.length, 1);
  assert.match(limited[0].clientText, /merci/);
  const estimate = simulationCallEstimate(120, { liveEngine: true, llm: true });
  assert.equal(estimate.demandes, 960);
  assert.equal(estimate.appelsTotal, 1920);
  assert.equal(simulationCallEstimate(120).appelsTotal, 0);
  const key = simulationBatchKey({ day: "2026-11-26", references: ["TB-2026-8801"], sample: 8 });
  assert.equal(key, simulationBatchKey({ day: "2026-11-26", references: ["TB-2026-8801"], sample: 8 }));
  assert.equal(await diversifyClientText("bonjour", undefined, { left: 3 }), "bonjour");
});

test("l’enregistrement marque la simulation et reste idempotent", async () => {
  const seen: { conflict?: string; rows: Record<string, unknown>[] }[] = [];
  const writer = {
    from() {
      return {
        upsert: async (rows: Record<string, unknown>[] , options?: { onConflict?: string }) => {
          seen.push({ conflict: options?.onConflict, rows });
          return { error: null };
        },
      };
    },
  };
  const results = await runReservationSimulation({
    cases: [{ reference: "TB-2026-8801", dossier: dossier() }],
    now: NOW,
    style: "net",
    budget: 1,
  });
  const key = simulationBatchKey({ day: "2026-11-26", references: ["TB-2026-8801"], sample: 1 });
  const first = await storeReservationSimulation(writer, { batchKey: key, batchId: "batch-1", rows: results });
  const second = await storeReservationSimulation(writer, { batchKey: key, batchId: "batch-1", rows: results });
  assert.equal(first.stored, 2);
  assert.equal(second.stored, 2);
  assert.equal(seen[0].conflict, "batch_key,booking_reference,kind,mode");
  assert.equal(seen[0].rows.every((row) => row.source === "simulation_reservations"), true);
  assert.equal(JSON.stringify(seen).includes("12AB34567"), false);
});

test("la lecture ne demande pas de pièce d’identité", async () => {
  const selects: string[] = [];
  const reader = {
    from() {
      return {
        select(columns: string) {
          selects.push(columns);
          return {
            limit: async () => ({
              data: [
                {
                  id: "stay-rome",
                  reference: "TB-2026-8801",
                  title: "Rome",
                  destination: "Rome",
                  start_date: "2026-12-04",
                  end_date: "2026-12-08",
                  currency: "EUR",
                  total_amount: 0,
                  customer_id: "cus",
                  visible_to_client: true,
                  prices_visible: true,
                  cover_image_path: null,
                  share_code: null,
                },
              ],
              error: null,
            }),
            in: async () => ({
              data: [
                {
                  id: "fl",
                  booking_id: "stay-rome",
                  kind: "flight",
                  title: "Paris → Rome",
                  start_at: "2026-12-04T10:30:00",
                  end_at: "2026-12-04T12:40:00",
                  amount: null,
                  visible_to_client: true,
                  details: { flight_number: "AF1204", passport_number: "12AB34567", from: "CDG", to: "FCO", city_from: "Paris", city_to: "Rome" },
                },
              ],
              error: null,
            }),
          };
        },
      };
    },
  };
  const loaded = await readReservationCases(reader, { limit: 1, seed: "test" });
  assert.equal(loaded.cases.length, 1);
  assert.equal(selects.join(" ").includes("passport"), false);
  assert.equal(JSON.stringify(loaded.cases).includes("12AB34567"), false);
});

test("le script est coupé et n’envoie rien", () => {
  const run = spawnSync(process.execPath, ["scripts/concierge-reservation-sim.mjs"], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    encoding: "utf8",
    env: { ...process.env, CONCIERGE_SIM_RESERVATIONS: "" },
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /coupée/);
  const sources = [
    "lib/crm/concierge-reservation-sim.ts",
    "lib/crm/concierge-reservation-load.ts",
    "lib/crm/concierge-reservation-store.ts",
    "scripts/concierge-reservation-sim.mjs",
    "app/api/admin/concierge/simulation/route.ts",
  ];
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("sendWhatsappSession"), false, file);
    assert.equal(source.includes("crm_whatsapp_requests"), false, file);
  }
});
