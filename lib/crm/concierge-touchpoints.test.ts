import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { planFollowups } from "./concierge-journey";
import { CONCIERGE_TEMPLATES, templateIsArmed } from "./concierge-templates";
import {
  TOUCHPOINT_CONTENT_DRAFTS,
  clientTouchpointBody,
  decideTouchpointDelivery,
  factsFromDossier,
} from "./concierge-touchpoints";
import { buildConciergeDossier } from "./whatsapp-concierge";

const EVE = new Date("2026-10-19T12:00:00Z");

test("la veille hors fenêtre reste un brouillon, avec le vol connu", () => {
  const rows = planFollowups({
    now: EVE,
    lastInbound: null,
    stayStart: "2026-10-20",
    stayEnd: "2026-10-26",
    briefOpen: false,
    firstName: "Alma",
    stay: { destination: "Tel Aviv" },
    facts: { flightNumber: "LY320", flightClock: "09h15", passportInVault: false },
  });
  const row = rows.find((item) => item.kind === "predeparture");
  assert.ok(row);
  assert.equal(row.channel, "template");
  assert.equal(row.templateKey, "concierge_veille");
  assert.match(row.body, /LY320/);
  assert.match(row.body, /9h15/);
  assert.match(row.body, /non soumis à Meta/);
  assert.equal(clientTouchpointBody(row.body).includes("non soumis"), false);
  const decision = decideTouchpointDelivery({
    kind: "predeparture",
    templateKey: row.templateKey,
    windowOpen: false,
    preview: false,
    dueAt: row.dueAt,
    now: EVE,
  });
  assert.equal(decision.send, false);
  if (!decision.send) assert.match(decision.error, /pas encore approuvé/);
});

test("dans la fenêtre, la veille cite le vol et le coffre, sans pièce", () => {
  const dossier = buildConciergeDossier({
    firstName: "Alma",
    bookings: [
      {
        id: "stay",
        reference: "TB-2026-1022",
        title: "Tel Aviv",
        destination: "Tel Aviv",
        start_date: "2026-10-20",
        end_date: "2026-10-26",
        currency: "EUR",
        total_amount: 0,
        visible_to_client: true,
        cover_image_path: null,
      },
    ],
    items: [
      {
        id: "flight",
        booking_id: "stay",
        kind: "flight",
        title: "Vol",
        supplier: "Hotelbeds",
        start_at: "2026-10-20T09:15:00",
        end_at: "2026-10-20T13:00:00",
        amount: 800,
        details: { flight_number: "LY320", from: "CDG", to: "TLV", city_from: "Paris", city_to: "Tel Aviv", supplier: "Expedia" },
        visible_to_client: true,
      },
    ],
    travelDocuments: [
      { doc_type: "passport", first_name: "Alma", last_name: "Martin", expires_on: "2031-07-17" },
    ],
  });
  const touch = factsFromDossier(dossier, EVE);
  assert.equal(touch?.facts.flightNumber, "LY320");
  assert.equal(touch?.facts.passportInVault, true);
  const rows = planFollowups({
    now: EVE,
    lastInbound: new Date("2026-10-19T11:00:00Z"),
    stayStart: "2026-10-20",
    stayEnd: "2026-10-26",
    briefOpen: false,
    firstName: "Alma",
    stay: touch?.stay,
    facts: touch?.facts,
  });
  const row = rows.find((item) => item.kind === "predeparture");
  assert.ok(row);
  assert.equal(row.channel, "session");
  assert.match(row.body, /LY320/);
  assert.match(row.body, /9h15/);
  assert.match(row.body, /passeport est au coffre/);
  assert.equal(row.body.includes("Hotelbeds"), false);
  assert.equal(row.body.includes("Expedia"), false);
  assert.equal(row.body.includes("800"), false);
  assert.equal(row.body.includes("Martin"), false);
  assert.equal(row.body.includes("Paris"), false);
  const decision = decideTouchpointDelivery({
    kind: "predeparture",
    templateKey: row.templateKey,
    windowOpen: true,
    preview: false,
    dueAt: row.dueAt,
    now: EVE,
  });
  assert.equal(decision.send, true);
});

test("l’arrivée accueille, le retour remercie, deux jours avant rien", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  const rows = planFollowups({
    now,
    lastInbound: new Date("2026-10-22T08:00:00Z"),
    stayStart: "2026-10-22",
    stayEnd: "2026-10-22",
    briefOpen: false,
    firstName: "Alma",
    stay: { destination: "Tel Aviv" },
    facts: { hotelName: "The Norman", hotelArrival: true },
  });
  const arrival = rows.find((item) => item.kind === "checkin");
  const back = rows.find((item) => item.kind === "feedback");
  assert.match(arrival?.body || "", /The Norman/);
  assert.match(arrival?.body || "", /Besoin de quelque chose/);
  assert.match(back?.body || "", /merci pour ce séjour à Tel Aviv/i);
  const early = planFollowups({
    now: new Date("2026-10-18T12:00:00Z"),
    lastInbound: null,
    stayStart: "2026-10-20",
    stayEnd: "2026-10-26",
    briefOpen: false,
  });
  assert.equal(early.some((item) => item.kind === "predeparture"), false);
});

test("l’aperçu, le silence et une relance d’hier n’envoient pas", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  assert.equal(
    decideTouchpointDelivery({
      kind: "predeparture",
      windowOpen: true,
      preview: false,
      dueAt: "2026-10-19T12:00:00.000Z",
      now,
    }).send,
    false
  );
  assert.equal(
    decideTouchpointDelivery({
      kind: "checkin",
      windowOpen: true,
      preview: true,
      dueAt: now.toISOString(),
      now,
    }).send,
    false
  );
  assert.equal(
    decideTouchpointDelivery({
      kind: "silence_template",
      windowOpen: true,
      preview: false,
      dueAt: now.toISOString(),
      now,
    }).send,
    false
  );
});

test("les modèles de relance sont définis et ne sont pas soumis", () => {
  assert.ok(TOUCHPOINT_CONTENT_DRAFTS.every((row) => row.submitted === false && row.category === "UTILITY"));
  assert.deepEqual(
    TOUCHPOINT_CONTENT_DRAFTS.map((row) => row.friendly_name),
    ["concierge_veille", "concierge_arrivee", "concierge_merci"]
  );
  for (const key of ["concierge_veille", "concierge_arrivee", "concierge_merci"]) {
    const template = CONCIERGE_TEMPLATES.find((row) => row.key === key);
    assert.ok(template);
    assert.equal(templateIsArmed(template), false);
  }
  const run = readFileSync("lib/crm/concierge-touchpoint-run.ts", "utf8");
  assert.equal(run.includes("sendWhatsapp"), false);
  assert.equal(run.includes("Messages.json"), false);
  assert.equal(run.includes("ApprovalRequests"), false);
  for (const name of readdirSync("scripts")) {
    if (!name.endsWith(".mjs") && !name.endsWith(".ts")) continue;
    assert.equal(readFileSync(`scripts/${name}`, "utf8").includes("concierge_veille"), false);
  }
});
