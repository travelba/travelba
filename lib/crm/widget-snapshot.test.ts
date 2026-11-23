import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  buildWidgetSnapshot,
  emptyWidgetSnapshot,
  stayCountdownLabel,
  tripWidgetHref,
  WIDGET_FLIGHT_KEYS,
  WIDGET_LIVE_STATE_KEYS,
  type WidgetItem,
} from "./widget-snapshot";

const NOW = new Date("2026-11-11T11:35:20Z");
const TODAY = "2026-11-11";

function flight(partial: Partial<WidgetItem> = {}): WidgetItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "flight",
    supplier: "Air France",
    start_at: "2026-11-11T13:48:00",
    end_at: "2026-11-11T15:15:00",
    visible_to_client: true,
    lifecycle: "active",
    details: {
      airline: "Air France",
      flight_number: "AF 7308",
      from: "CDG",
      to: "NCE",
      city_from: "Paris",
      city_to: "Nice",
      gate: "F35",
      terminal: "2F",
      amount: 999,
      departure_timezone: "Europe/Paris",
      arrival_timezone: "Europe/Paris",
      flight_watch: {
        status: "scheduled",
        scheduled_out: "2026-11-11T13:48:00",
        estimated_out: "2026-11-11T13:48:00",
        scheduled_in: "2026-11-11T15:15:00",
        gate_origin: "F35",
        terminal_origin: "2F",
      },
    },
    ...partial,
  };
}

test("le compte à rebours suit le jour de Paris", () => {
  assert.equal(stayCountdownLabel("2026-11-23", "2026-11-11"), "J - 12");
  assert.equal(stayCountdownLabel("2026-11-11", "2026-11-11"), "Aujourd’hui");
  assert.equal(stayCountdownLabel("2026-11-10", "2026-11-11"), "");
  assert.equal(tripWidgetHref("TB-2026-0001"), "/mon-compte/reservations/TB-2026-0001");
  assert.equal(tripWidgetHref("../admin"), "/mon-compte");
});

test("le résumé donne le séjour, le vol et la météo, sans prix", () => {
  const snapshot = buildWidgetSnapshot({
    now: NOW,
    today: TODAY,
    stay: {
      title: "Nice",
      startDate: "2026-11-11",
      endDate: "2026-11-14",
      href: "/mon-compte/reservations/TB-2026-0001",
      items: [flight(), { ...flight(), id: "22222222-2222-4222-8222-222222222222", kind: "fee", visible_to_client: false }],
    },
    weather: { place: "Nice", tempC: 18.4, label: "Ensoleillé", icon: "sun" },
  });
  assert.equal(snapshot.trip?.title, "Nice");
  assert.equal(snapshot.trip?.countdown, "Aujourd’hui");
  assert.equal(snapshot.trip?.href, "/mon-compte/reservations/TB-2026-0001");
  assert.equal(snapshot.flight?.number, "AF 7308");
  assert.equal(snapshot.flight?.route, "Paris → Nice");
  assert.equal(snapshot.flight?.codes, "CDG → NCE");
  assert.equal(snapshot.flight?.time, "13:48");
  assert.equal(snapshot.flight?.gate, "F35");
  assert.equal(snapshot.flight?.terminal, "2F");
  assert.equal(snapshot.flight?.place, "Terminal 2F · Porte F35");
  assert.equal(snapshot.flight?.status, "À l’heure");
  assert.equal(snapshot.weather?.tempC, 18);
  assert.equal(snapshot.weather?.place, "Nice");
  assert.equal(snapshot.live?.ending, false);
  assert.equal(snapshot.live?.state.status, "scheduled");
  assert.equal(snapshot.live?.state.boardingCountdown, -1);
  assert.deepEqual(Object.keys(snapshot.flight || {}).sort(), [...WIDGET_FLIGHT_KEYS].sort());
  assert.deepEqual(Object.keys(snapshot.live?.state || {}).sort(), [...WIDGET_LIVE_STATE_KEYS].sort());
  const json = JSON.stringify(snapshot);
  assert.equal(json.includes("999"), false);
  assert.equal(json.includes("amount"), false);
  assert.equal(json.includes("passport"), false);
});

test("un vol caché ou trop lointain n’ouvre pas l’activité", () => {
  const hidden = buildWidgetSnapshot({
    now: NOW,
    today: TODAY,
    stay: {
      title: "Nice",
      startDate: "2026-11-11",
      endDate: "2026-11-14",
      href: "/mon-compte/reservations/TB-2026-0001",
      items: [flight({ visible_to_client: false })],
    },
    weather: null,
  });
  assert.equal(hidden.flight, null);
  assert.equal(hidden.live, null);

  const later = buildWidgetSnapshot({
    now: NOW,
    today: TODAY,
    stay: {
      title: "Nice",
      startDate: "2026-11-21",
      endDate: "2026-11-24",
      href: "/mon-compte/reservations/TB-2026-0002",
      items: [
        flight({
          start_at: "2026-11-21T13:48:00",
          end_at: "2026-11-21T15:15:00",
          details: {
            ...(flight().details || {}),
            flight_watch: {
              status: "scheduled",
              scheduled_out: "2026-11-21T13:48:00",
              scheduled_in: "2026-11-21T15:15:00",
            },
          },
        }),
      ],
    },
    weather: { place: "voyage", tempC: 1, label: "x", icon: "sun" },
  });
  assert.equal(later.trip?.countdown, "J - 10");
  assert.equal(later.flight?.number, "AF 7308");
  assert.equal(later.live, null);
  assert.equal(later.weather, null);
  assert.equal(emptyWidgetSnapshot(NOW).trip, null);
});

test("un retard affiche l’heure estimée, la porte et le statut", () => {
  const snapshot = buildWidgetSnapshot({
    now: NOW,
    today: TODAY,
    stay: {
      title: "Nice",
      startDate: "2026-11-11",
      endDate: "2026-11-11",
      href: "/mon-compte/reservations/TB-2026-0001",
      items: [
        flight({
          details: {
            ...(flight().details || {}),
            flight_watch: {
              status: "delayed",
              scheduled_out: "2026-11-11T13:48:00",
              estimated_out: "2026-11-11T14:20:00",
              scheduled_in: "2026-11-11T15:15:00",
              gate_origin: "K35",
              terminal_origin: "2E",
            },
          },
        }),
      ],
    },
    weather: null,
  });
  assert.equal(snapshot.flight?.time, "14:20");
  assert.equal(snapshot.flight?.scheduled, "13:48");
  assert.equal(snapshot.flight?.estimated, "14:20");
  assert.equal(snapshot.flight?.status, "Retard");
  assert.equal(snapshot.flight?.gate, "K35");
  assert.equal(snapshot.live?.state.delayMinutes, 32);
  assert.equal(snapshot.live?.state.status, "delayed");
});

test("la route widgets exige le titulaire", () => {
  const route = readFileSync(join(process.cwd(), "app/api/client/widgets/route.ts"), "utf8");
  const load = readFileSync(join(process.cwd(), "lib/crm/widget-snapshot-load.ts"), "utf8");
  assert.match(route, /requireCustomer/);
  assert.match(route, /loadClientWidgetSnapshot/);
  assert.doesNotMatch(route, /amount|passport|service_role/i);
  assert.match(load, /loadVisibleCarnets/);
  assert.doesNotMatch(load, /select\("\*"\)/);
});
