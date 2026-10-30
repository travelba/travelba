import assert from "node:assert/strict";
import test from "node:test";
import {
  compareLeMadeAt,
  firstLeMadeAt,
  leBookedAtFromPayload,
  leMadeDayLabel,
  leParisDay,
  sortByLeMadeAt,
} from "./le-made-at";
import { earliestLeConfirmationAt, leListMadeAt } from "./le-confirmation-mail";

test("la date Little Emperors n’est pas l’arrivée", () => {
  const payload = {
    check_in: "2026-12-02",
    check_out: "2026-12-06",
    cancellation_deadline: "2026-11-01 12:00:00",
    created_at: "2026-10-18T09:30:00Z",
  };
  assert.equal(leBookedAtFromPayload(payload), "2026-10-18T09:30:00.000Z");
  assert.equal(leBookedAtFromPayload({ check_in: "2026-12-02", updated_at: "2026-10-01T00:00:00Z" }), null);
  assert.equal(leParisDay("2026-10-18T23:30:00Z"), "2026-10-19");
  assert.equal(leMadeDayLabel("2026-10-18T23:30:00Z"), "19 oct. 2026");
});

test("la date de réservation suit création LE, e-mail, puis l’enregistrement", () => {
  const raw = { created_at: "2026-09-02T08:00:00Z", check_in: "2026-12-02" };
  assert.equal(
    firstLeMadeAt(raw, "2026-10-01T10:00:00Z", null, "2026-10-20T09:00:00Z"),
    "2026-09-02T08:00:00.000Z"
  );
  assert.equal(
    firstLeMadeAt({ check_in: "2026-12-02" }, "2026-10-01T10:00:00Z", null, "2026-10-20T09:00:00Z"),
    "2026-10-01T10:00:00.000Z"
  );
  assert.equal(firstLeMadeAt({ hotel_name: "Nobu" }, null, null, "2026-10-20 09:31:13+00"), "2026-10-20T09:31:13.000Z");
});

test("l’e-mail de confirmation le plus ancien l’emporte, y compris le numéro court", () => {
  const mails = [
    {
      label: "Little Emperors",
      subject: "Booking update 64570SH046795",
      received_at: "2026-10-12T15:00:00Z",
      extract: { items: [{ confirmation_ref: "64570SH046795" }] },
    },
    {
      label: "Little Emperors",
      subject: "Confirmation",
      received_at: "2026-10-03T11:00:00Z",
      extract: { items: [{ confirmation_ref: "64570", details: { rooms: [{ confirmation_ref: "H998877" }] } }] },
    },
    {
      label: "billet-avion",
      subject: "64570",
      received_at: "2026-09-01T11:00:00Z",
      extract: null,
    },
  ];
  assert.equal(earliestLeConfirmationAt(["64570SH046795"], mails), "2026-10-03T11:00:00.000Z");
  assert.equal(earliestLeConfirmationAt(["H998877"], mails), "2026-10-03T11:00:00.000Z");
  assert.equal(earliestLeConfirmationAt(["AUTRE"], mails), null);
  assert.equal(
    leListMadeAt(
      { confirmation_number: "64570SH046795", raw: { check_in: "2026-12-02" }, created_at: "2026-10-20T09:00:00Z" },
      mails
    ),
    "2026-10-03T11:00:00.000Z"
  );
});

test("le tri par défaut est la date de réservation, la plus récente d’abord", () => {
  const rows = [
    { id: "ancien", booked_on: "2026-09-01T00:00:00.000Z", check_in: "2026-12-20" },
    { id: "recent", booked_on: "2026-10-20T00:00:00.000Z", check_in: "2026-11-02" },
    { id: "sans", booked_on: null, check_in: "2026-08-01" },
  ];
  assert.deepEqual(
    sortByLeMadeAt(rows).map((row) => row.id),
    ["recent", "ancien", "sans"]
  );
  assert.deepEqual(
    sortByLeMadeAt(rows, false).map((row) => row.id),
    ["ancien", "recent", "sans"]
  );
  assert.equal(compareLeMadeAt(rows[1].booked_on, rows[0].booked_on), -1);
});
