import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  checkinInputHasIdentity,
  checkinManualWrite,
  checkinMcpLine,
  checkinPassWrites,
  checkinSentWrites,
  displayCheckinStatus,
  dossierCheckinBadge,
  flightCheckinViews,
  formatCheckinOpening,
  onlineCheckinLeadHours,
  onlineCheckinOpensAt,
  parseOnlineCheckinStatus,
  type CheckinFlight,
} from "./online-checkin";

const NOW = new Date("2026-10-26T10:00:00.000Z");

function flight(partial: Partial<CheckinFlight> = {}): CheckinFlight {
  return {
    id: "flight-1",
    kind: "flight",
    title: "Paris → Rome",
    supplier: "Lufthansa",
    start_at: "2026-10-27T09:00:00.000Z",
    details: { airline: "Lufthansa", airline_iata: "LH", flight_number: "LH 1234", from: "CDG", to: "FCO" },
    lifecycle: "active",
    source_document_id: null,
    ...partial,
  };
}

test("Lufthansa ouvre 23 h avant, une compagnie inconnue 24 h", () => {
  const lh = onlineCheckinOpensAt(flight());
  assert.equal(lh?.toISOString(), "2026-10-26T10:00:00.000Z");
  assert.equal(onlineCheckinLeadHours(flight()), 23);
  const corsair = flight({
    id: "flight-2",
    supplier: "Corsair",
    details: { airline: "Corsair", flight_number: "SS 954", from: "ORY", to: "PTP" },
  });
  assert.equal(onlineCheckinLeadHours(corsair), 24);
  assert.equal(onlineCheckinOpensAt(corsair)?.toISOString(), "2026-10-26T09:00:00.000Z");
  assert.equal(onlineCheckinOpensAt(flight({ start_at: null })), null);
  assert.match(formatCheckinOpening(lh), /Ouverture le 26 oct\. à 1[12]h00/);
});

test("le statut affiché suit la fenêtre, les cartes et l’envoi, sans redescendre", () => {
  const opens = new Date("2026-10-26T09:00:00.000Z");
  assert.equal(
    displayCheckinStatus({ stored: null, opensAt: opens, now: NOW, boardingPass: false, sent: false, cancelled: false }),
    "ouvert"
  );
  assert.equal(
    displayCheckinStatus({ stored: "a_faire", opensAt: opens, now: new Date("2026-10-26T08:00:00.000Z"), boardingPass: false, sent: false, cancelled: false }),
    "a_faire"
  );
  assert.equal(
    displayCheckinStatus({ stored: "en_cours", opensAt: opens, now: NOW, boardingPass: false, sent: false, cancelled: false }),
    "en_cours"
  );
  assert.equal(
    displayCheckinStatus({ stored: "a_faire", opensAt: opens, now: NOW, boardingPass: true, sent: false, cancelled: false }),
    "cartes_recues"
  );
  assert.equal(
    displayCheckinStatus({ stored: "fait", opensAt: opens, now: NOW, boardingPass: true, sent: false, cancelled: false }),
    "cartes_recues"
  );
  assert.equal(
    displayCheckinStatus({ stored: "envoyees", opensAt: opens, now: NOW, boardingPass: true, sent: false, cancelled: false }),
    "envoyees"
  );
  assert.equal(
    displayCheckinStatus({ stored: "a_faire", opensAt: opens, now: NOW, boardingPass: false, sent: false, cancelled: true }),
    "a_faire"
  );
});

test("la checklist se coche et alerte quand c’est ouvert", () => {
  const lines = flightCheckinViews({
    items: [
      flight(),
      flight({
        id: "flight-2",
        title: "Rome → Paris",
        start_at: "2026-11-02T18:00:00.000Z",
        details: { airline_iata: "AF", flight_number: "AF 1504", from: "FCO", to: "CDG" },
      }),
    ],
    documents: [{ id: "doc-1", kind: "carte d'embarquement", file_name: "LH1234.pdf", booking_item_id: "flight-1" }],
    rows: [{ booking_item_id: "flight-1", status: "en_cours", actor: "bot" }],
    now: NOW,
  });
  assert.equal(lines[0].status, "cartes_recues");
  assert.equal(lines[0].done, true);
  assert.equal(lines[0].alert, false);
  assert.equal(lines[0].actorLabel, "Enregistrement en ligne");
  assert.equal(lines[1].status, "a_faire");
  assert.equal(lines[1].alert, false);
  assert.equal(lines[1].leadHours, 30);
  const open = flightCheckinViews({
    items: [flight({ start_at: "2026-10-27T09:00:00.000Z" })],
    documents: [],
    rows: [],
    now: NOW,
  });
  assert.equal(open[0].status, "ouvert");
  assert.equal(open[0].alert, true);
  assert.equal(open[0].done, false);
  assert.equal(dossierCheckinBadge(open)?.label, "Enregistrement ouvert");
  assert.equal(dossierCheckinBadge(lines)?.alert, false);
});

test("un seul vol reçoit la carte même sans lien, deux vols attendent le bon numéro", () => {
  const solo = checkinPassWrites({
    bookingId: "booking-1",
    items: [flight()],
    documents: [{ id: "doc-1", kind: "carte d’embarquement", file_name: "carte.pdf", booking_item_id: null }],
    rows: [],
    actor: "bot",
    now: NOW,
  });
  assert.deepEqual(solo, [
    { booking_item_id: "flight-1", booking_id: "booking-1", status: "cartes_recues", actor: "bot" },
  ]);
  const pair = checkinPassWrites({
    bookingId: "booking-1",
    items: [flight(), flight({ id: "flight-2", details: { flight_number: "AF 1504", airline_iata: "AF" } })],
    documents: [{ id: "doc-1", kind: "carte d'embarquement", file_name: "carte.pdf", booking_item_id: null }],
    rows: [],
    actor: "agence",
    now: NOW,
  });
  assert.deepEqual(pair, []);
  const named = checkinPassWrites({
    bookingId: "booking-1",
    items: [flight(), flight({ id: "flight-2", start_at: "2026-11-02T18:00:00.000Z", details: { flight_number: "AF 1504", airline_iata: "AF" } })],
    documents: [{ id: "doc-1", kind: "carte d'embarquement", file_name: "AF1504-carte.pdf", booking_item_id: null }],
    rows: [{ booking_item_id: "flight-1", status: "envoyees", actor: "agence" }],
    actor: "bot",
    now: NOW,
  });
  assert.deepEqual(
    named.map((row) => row.booking_item_id),
    ["flight-2"]
  );
});

test("l’envoi et la saisie ne redescendent pas un statut plus avancé", () => {
  const sent = checkinSentWrites({
    bookingId: "booking-1",
    items: [flight(), flight({ id: "flight-2", details: { flight_number: "AF 9", airline_iata: "AF" } })],
    documents: [{ id: "doc-1", kind: "carte d'embarquement", file_name: "LH1234.pdf", booking_item_id: "flight-1" }],
    rows: [{ booking_item_id: "flight-1", status: "cartes_recues", actor: "bot" }],
    actor: "agence",
    documentIds: ["doc-1"],
    flightLabels: ["LH 1234"],
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].status, "envoyees");
  assert.equal(sent[0].booking_item_id, "flight-1");
  const kept = checkinManualWrite({
    bookingId: "booking-1",
    itemId: "flight-1",
    requested: "a_faire",
    stored: "cartes_recues",
    boardingPass: true,
    sent: false,
    actor: "agence",
  });
  assert.equal(kept.status, "cartes_recues");
  const marked = checkinManualWrite({
    bookingId: "booking-1",
    itemId: "flight-2",
    requested: "fait",
    stored: "en_cours",
    boardingPass: false,
    sent: false,
    actor: "bot",
  });
  assert.equal(marked.status, "fait");
  assert.equal(marked.actor, "bot");
});

test("la lecture MCP ne porte ni passeport ni MRZ", () => {
  const [line] = flightCheckinViews({
    items: [flight()],
    documents: [],
    rows: [{ booking_item_id: "flight-1", status: "fait", actor: "bot" }],
    now: new Date("2026-10-20T10:00:00.000Z"),
  });
  const payload = checkinMcpLine(line);
  const blob = JSON.stringify(payload);
  assert.equal(payload.par, "Enregistrement en ligne");
  assert.equal(payload.statut, "fait");
  assert.doesNotMatch(blob, /mrz|passeport|passport|P</i);
  assert.equal(checkinInputHasIdentity({ statut: "fait", mrz: "P<FRA" }), true);
  assert.equal(checkinInputHasIdentity({ statut: "fait", carte_id: "flight-1" }), false);
  assert.equal(parseOnlineCheckinStatus("cartes reçues"), "cartes_recues");
  assert.equal(parseOnlineCheckinStatus("envoyé au client"), null);
  const sql = readFileSync(new URL("../../supabase/migrations/20261027183000_flight_online_checkin.sql", import.meta.url), "utf8");
  assert.match(sql, /crm_flight_checkins/);
  assert.doesNotMatch(sql, /passport_number|mrz_line|personal_number|drop table|delete from/i);
  assert.match(sql, /Sans numéro de passeport ni MRZ/);
  assert.match(sql, /if not exists/);
});
