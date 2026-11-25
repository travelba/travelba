import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { apnsRequestHeaders } from "./apns-token";
import {
  LIVE_ACTIVITY_ATTRIBUTES_TYPE,
  boardingCountdownSeconds,
  buildLiveActivityPayload,
  clockDelayMinutes,
  flightActivityModel,
  liveActivityAlert,
  liveActivityEvent,
  liveActivityOpen,
  liveActivityTopic,
  parseLiveActivityEnd,
  parseLiveActivityRegistration,
} from "./live-activity";
import { buildLiveFlight } from "./next-flight-model";

const NOW = Date.parse("2026-11-11T11:35:20Z");
const TOKEN = "ab".repeat(32);

function item(status = "scheduled", estimated = "2026-11-11T13:48:00") {
  return {
    supplier: "Air France",
    start_at: "2026-11-11T13:48:00",
    end_at: "2026-11-11T15:15:00",
    details: {
      airline: "Air France",
      flight_number: "AF7308",
      from: "CDG",
      to: "NCE",
      city_from: "Paris",
      city_to: "Nice",
      gate: "F35",
      terminal: "2F",
      departure_timezone: "Europe/Paris",
      arrival_timezone: "Europe/Paris",
      flight_watch: {
        status,
        scheduled_out: "2026-11-11T13:48:00",
        estimated_out: estimated,
        scheduled_in: "2026-11-11T15:15:00",
        gate_origin: "F35",
        terminal_origin: "2F",
      },
    },
  };
}

test("la fenêtre suit le départ, et un vol sans instant ne part pas", () => {
  const flight = buildLiveFlight(item());
  assert.equal(liveActivityOpen(flight, NOW), true);
  assert.equal(liveActivityEvent(flight, NOW), "update");
  assert.equal(liveActivityOpen(flight, NOW - 9 * 60 * 60 * 1000), false);
  assert.equal(liveActivityEvent(flight, NOW - 9 * 60 * 60 * 1000), "none");
  const far = buildLiveFlight({
    ...item(),
    start_at: "2026-12-01T13:48:00",
    details: {
      ...item().details,
      flight_watch: { ...item().details.flight_watch, scheduled_out: "2026-12-01T13:48:00", status: "cancelled" },
    },
  });
  assert.equal(liveActivityOpen(far, NOW), false);
  assert.equal(liveActivityTopic("fr.travelba.client"), "fr.travelba.client.push-type.liveactivity");
  assert.equal(clockDelayMinutes("13:48", "14:20"), 32);
  assert.equal(clockDelayMinutes("13:48", "13:48"), 0);
  assert.equal(boardingCountdownSeconds({ boarding_time: "13:10" }, NOW), -1);
  assert.equal(boardingCountdownSeconds({ boarding_at: "2026-11-11T12:35:20Z" }, NOW), 3600);
});

test("le push start, update et end porte le bon type et les mêmes clés", () => {
  const model = flightActivityModel(item("delayed", "2026-11-11T14:20:00"), NOW);
  assert.ok(model);
  assert.equal(model?.attributes.flightNumber, "AF 7308");
  assert.equal(model?.attributes.route, "Paris → Nice");
  assert.equal(model?.state.gate, "F35");
  assert.equal(model?.state.terminal, "2F");
  assert.equal(model?.state.delayMinutes, 32);
  const timestamp = 1_700_000_000;
  const start = buildLiveActivityPayload({
    event: "start",
    attributes: model?.attributes,
    state: model!.state,
    timestamp,
    staleDate: model?.staleDate,
    alert: liveActivityAlert("start", model!.attributes, model!.state),
  });
  const aps = (start as { aps: Record<string, unknown> }).aps;
  assert.equal(aps.event, "start");
  assert.equal(aps["attributes-type"], LIVE_ACTIVITY_ATTRIBUTES_TYPE);
  assert.equal(aps["attributes-type"], "FlightActivityAttributes");
  assert.deepEqual(Object.keys(aps["content-state"] as object).sort(), [
    "boardingCountdown",
    "delayMinutes",
    "gate",
    "status",
    "terminal",
  ]);
  assert.equal((aps.alert as { title: string }).title, "AF 7308");
  const update = buildLiveActivityPayload({ event: "update", state: model!.state, timestamp });
  assert.equal((update as { aps: Record<string, unknown> }).aps["attributes-type"], undefined);
  const end = buildLiveActivityPayload({
    event: "end",
    state: { ...model!.state, status: "landed" },
    timestamp,
    dismissalDate: timestamp + 1800,
    alert: liveActivityAlert("end", model!.attributes, { ...model!.state, status: "landed" }),
  });
  const ended = (end as { aps: Record<string, unknown> }).aps;
  assert.equal(ended.event, "end");
  assert.equal(ended["dismissal-date"], timestamp + 1800);
  assert.equal((ended.alert as { title: string }).title, "Arrivé");
  assert.equal(buildLiveActivityPayload({ event: "start", state: model!.state, timestamp }), null);
  const headers = apnsRequestHeaders({
    bundleId: "fr.travelba.client",
    pushType: "liveactivity",
    authorization: "jwt",
  });
  assert.equal(headers["apns-push-type"], "liveactivity");
  assert.equal(headers["apns-topic"], "fr.travelba.client.push-type.liveactivity");
  assert.equal(headers.authorization, "bearer jwt");
  const alert = apnsRequestHeaders({ bundleId: "fr.travelba.client", authorization: "jwt" });
  assert.equal(alert["apns-push-type"], "alert");
  assert.equal(alert["apns-topic"], "fr.travelba.client");
  assert.ok(JSON.stringify(start).length < 4096);
});

test("l’enregistrement refuse un jeton ou un vol mal formé", () => {
  assert.equal(parseLiveActivityRegistration(null).ok, false);
  assert.equal(parseLiveActivityRegistration({ pushToStartToken: TOKEN }).ok, false);
  const start = parseLiveActivityRegistration({ deviceToken: TOKEN, pushToStartToken: TOKEN });
  assert.equal(start.ok, true);
  if (start.ok) assert.equal(start.value.pushToStartToken, TOKEN);
  const activity = parseLiveActivityRegistration({
    activity: { id: "activity-1", token: TOKEN, itemId: "11111111-1111-4111-8111-111111111111" },
  });
  assert.equal(activity.ok, true);
  assert.equal(parseLiveActivityRegistration({ activity: { id: "bad id", token: TOKEN, itemId: "x" } }).ok, false);
  assert.equal(parseLiveActivityEnd({ activityId: "activity-1" })?.activityId, "activity-1");
  assert.equal(parseLiveActivityEnd({ activityId: "avec espace" }), null);
});

test("le suivi de vol branche l’activité, et la route exige le titulaire", () => {
  const watch = readFileSync(join(process.cwd(), "lib/crm/flight-watch-run.ts"), "utf8");
  const route = readFileSync(join(process.cwd(), "app/api/client/live-activity/route.ts"), "utf8");
  const run = readFileSync(join(process.cwd(), "lib/crm/live-activity-run.ts"), "utf8");
  assert.match(watch, /pushFlightLiveActivity/);
  assert.match(watch, /visible_to_client/);
  assert.match(route, /requireCustomer/);
  assert.match(route, /parseLiveActivityRegistration/);
  assert.match(run, /pushType: "liveactivity"/);
  assert.match(run, /currentApnsSettings/);
  assert.match(run, /skipped: "unconfigured"/);
  assert.match(run, /skipped: "schema"/);
});
