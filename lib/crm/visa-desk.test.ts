import assert from "node:assert/strict";
import test from "node:test";
import {
  agencyFeeVisible,
  canStartCorridor,
  clientNoticeAllowed,
  combinedCeilingEur,
  deskView,
  pieceReadyCopy,
  reasonLabel,
  refusalCopy,
  retryStillDue,
  shouldCloseCard,
  type DeskTask,
} from "./visa-desk";

test("le plafond Israël est 10 € par voyageur, l’ESTA n’est pas inventé", () => {
  assert.equal(combinedCeilingEur(["IL"], 4), 40);
  assert.equal(combinedCeilingEur(["IL", "US"], 1), null);
});

test("les 25 € n’apparaissent que si la taxe d’État est payée", () => {
  assert.equal(agencyFeeVisible(false), false);
  assert.equal(agencyFeeVisible(true), true);
});

test("une seconde demande pour le même pays ne part pas", () => {
  assert.equal(canStartCorridor(["IL"], "IL"), false);
  assert.equal(canStartCorridor(["IL"], "US"), true);
});

test("les messages client sont courts et sans numéro", () => {
  assert.equal(pieceReadyCopy("Israël", "Simon Albilila"), "Israël, Simon Albilila. La pièce est dans Pièces.");
  assert.match(refusalCopy("Israël", "Simon Albilila"), /n’est pas acceptée/);
  assert.equal(clientNoticeAllowed({ templateApproved: false, phone: "+33600000000" }), false);
  assert.equal(clientNoticeAllowed({ templateApproved: true, phone: "" }), false);
  assert.equal(clientNoticeAllowed({ templateApproved: true, phone: "+33600000000" }), true);
});

test("la liste À traiter met le récent en haut et garde Fait 7 jours", () => {
  const tasks: DeskTask[] = [
    {
      bookingId: "a",
      holderName: "Ada",
      reference: "TB-1",
      reasons: ["refus", "message"],
      doneAt: null,
      createdAt: "2026-09-20T10:00:00Z",
    },
    {
      bookingId: "b",
      holderName: "Bea",
      reference: "TB-2",
      reasons: ["refus"],
      doneAt: null,
      createdAt: "2026-09-22T10:00:00Z",
    },
    {
      bookingId: "c",
      holderName: "Clea",
      reference: "TB-3",
      reasons: ["message"],
      doneAt: "2026-09-20T10:00:00Z",
      createdAt: "2026-09-18T10:00:00Z",
    },
    {
      bookingId: "d",
      holderName: "Dina",
      reference: "TB-4",
      reasons: ["refus"],
      doneAt: "2026-09-01T10:00:00Z",
      createdAt: "2026-09-01T09:00:00Z",
    },
  ];
  const view = deskView(tasks, "2026-09-24");
  assert.deepEqual(view.open.map((row) => row.reference), ["TB-2", "TB-1"]);
  assert.equal(reasonLabel(view.open[1].reasons), "Refus · message non parti");
  assert.deepEqual(view.grey.map((row) => row.reference), ["TB-3"]);
  assert.equal(view.empty, false);
  assert.equal(deskView([], "2026-09-24").empty, true);
});

test("la carte se clôture le lendemain à 9 h, heure de Paris", () => {
  assert.equal(shouldCloseCard("2026-12-23", new Date("2026-12-24T07:30:00Z")), false);
  assert.equal(shouldCloseCard("2026-12-23", new Date("2026-12-24T08:30:00Z")), true);
});

test("un message raté est relancé trois jours", () => {
  assert.equal(retryStillDue("2026-09-24", "2026-09-27"), true);
  assert.equal(retryStillDue("2026-09-24", "2026-09-28"), false);
});
