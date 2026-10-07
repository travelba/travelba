import assert from "node:assert/strict";
import test from "node:test";
import { dashboardWeek, type DashboardWeekBooking } from "./dashboard-week";

const today = "2026-10-07";

function row(partial: DashboardWeekBooking): DashboardWeekBooking {
  return { visible_to_client: true, ...partial };
}

test("la semaine range en voyage, aujourd’hui et demain, puis les 7 jours", () => {
  const grouped = dashboardWeek(
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
    grouped.travelling.map((entry) => entry.booking.id),
    ["back", "out", "open"]
  );
  assert.equal(grouped.travelling[0].mark, "retour");
  assert.equal(grouped.travelling[1].mark, null);
  assert.equal(grouped.travelling[2].unseen, false);
  assert.deepEqual(
    grouped.soon.map((entry) => entry.booking.id),
    ["today", "tomorrow"]
  );
  assert.equal(grouped.soon[0].unseen, true);
  assert.equal(grouped.soon[1].unseen, false);
  assert.deepEqual(
    grouped.week.map((entry) => entry.booking.id),
    ["week"]
  );
  assert.equal(grouped.week[0].unseen, true);
});

test("un même dossier n’est compté qu’une fois", () => {
  const stay = row({ id: "once", start_date: "2026-10-08", end_date: "2026-10-09" });
  const grouped = dashboardWeek([stay, stay], today);
  assert.deepEqual(
    grouped.soon.map((entry) => entry.booking.id),
    ["once"]
  );
  assert.equal(grouped.travelling.length, 0);
  assert.equal(grouped.week.length, 0);
});
