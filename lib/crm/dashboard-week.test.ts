import assert from "node:assert/strict";
import test from "node:test";
import { dashboardWeek, type DashboardWeekBooking } from "./dashboard-week";

const today = "2026-10-07";

function row(partial: DashboardWeekBooking): DashboardWeekBooking {
  return { visible_to_client: true, ...partial };
}

test("la semaine aligne les jours jusqu’au dimanche, puis la semaine d’après", () => {
  const columns = dashboardWeek(
    [
      row({ id: "out", start_date: "2026-10-01", end_date: "2026-10-10" }),
      row({ id: "back", start_date: "2026-10-02", end_date: "2026-10-07" }),
      row({ id: "today", start_date: "2026-10-07", end_date: "2026-10-12", visible_to_client: false }),
      row({ id: "tomorrow", start_date: "2026-10-08", end_date: "2026-10-09" }),
      row({ id: "week", start_date: "2026-10-12", end_date: "2026-10-15", visible_to_client: false }),
      row({ id: "later", start_date: "2026-10-20", end_date: "2026-10-22" }),
      row({ id: "past", start_date: "2026-09-01", end_date: "2026-09-05" }),
      row({ id: "cancelled", start_date: "2026-10-09", end_date: "2026-10-11", status: "cancelled" }),
      row({ id: "archived", start_date: "2026-10-08", end_date: "2026-10-11", archived_at: "2026-10-01" }),
      row({ id: "open", start_date: "2026-09-20", end_date: null, visible_to_client: false }),
    ],
    today
  );

  assert.deepEqual(
    columns.map((item) => item.title),
    ["Aujourd’hui", "Jeudi", "Vendredi", "Samedi", "Dimanche", "Semaine pro", "Plus tard"]
  );
  assert.equal(columns[0].subtitle, "mer. 7 oct.");
  assert.equal(columns[1].subtitle, "J+1");
  assert.equal(columns[4].subtitle, "J+4");
  assert.equal(columns[5].subtitle, "12–18 oct.");
  assert.equal(columns[6].subtitle, "après le 18 oct.");
  assert.deepEqual(
    columns[0].entries.map((entry) => entry.booking.id),
    ["back", "out", "open", "today"]
  );
  assert.equal(columns[0].entries[0].mark, "retour");
  assert.equal(columns[0].entries[1].mark, "voyage");
  assert.equal(columns[0].entries[2].unseen, false);
  assert.equal(columns[0].entries[3].unseen, true);
  assert.deepEqual(
    columns[1].entries.map((entry) => entry.booking.id),
    ["tomorrow"]
  );
  assert.equal(columns[1].entries[0].unseen, false);
  assert.deepEqual(columns[2].entries, []);
  assert.deepEqual(
    columns[5].entries.map((entry) => entry.booking.id),
    ["week"]
  );
  assert.equal(columns[5].entries[0].unseen, true);
  assert.deepEqual(
    columns[6].entries.map((entry) => entry.booking.id),
    ["later"]
  );
  assert.equal(columns[6].entries[0].unseen, false);
  assert.equal(
    columns.some((item) => item.entries.some((entry) => entry.booking.id === "out" && item.id !== today)),
    false
  );
});

test("un même dossier n’est compté qu’une fois", () => {
  const stay = row({ id: "once", start_date: "2026-10-08", end_date: "2026-10-09" });
  const columns = dashboardWeek([stay, stay], today);
  const found = columns.flatMap((item) => item.entries);
  assert.deepEqual(
    found.map((entry) => entry.booking.id),
    ["once"]
  );
});

test("le lundi compte sept jours, le dimanche n’en garde qu’un", () => {
  const monday = dashboardWeek([], "2026-10-12").map((item) => `${item.title}|${item.subtitle}`);
  assert.deepEqual(monday, [
    "Aujourd’hui|lun. 12 oct.",
    "Mardi|J+1",
    "Mercredi|J+2",
    "Jeudi|J+3",
    "Vendredi|J+4",
    "Samedi|J+5",
    "Dimanche|J+6",
    "Semaine pro|19–25 oct.",
    "Plus tard|après le 25 oct.",
  ]);

  const sunday = dashboardWeek(
    [row({ id: "monday", start_date: "2026-10-12", end_date: "2026-10-14" })],
    "2026-10-11"
  );
  assert.deepEqual(
    sunday.map((item) => item.title),
    ["Aujourd’hui", "Semaine pro", "Plus tard"]
  );
  assert.deepEqual(
    sunday[1].entries.map((entry) => entry.booking.id),
    ["monday"]
  );
});

test("une semaine à cheval sur deux mois nomme les deux", () => {
  const columns = dashboardWeek([], "2026-10-19");
  assert.equal(columns.find((item) => item.id === "next")?.subtitle, "26 oct. – 1 nov.");
});
