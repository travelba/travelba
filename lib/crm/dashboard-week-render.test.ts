import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminLaunchStatus } from "../../components/admin/AdminLaunchStatus";
import { DashboardWeek } from "../../components/admin/DashboardWeek";
import type { DashboardWeekEntry } from "./dashboard-week";
import { buildLaunchItems, visibleLaunchItems } from "./launch-status";
import type { CrmBooking } from "./types";

function booking(partial: Partial<CrmBooking> & Pick<CrmBooking, "id" | "reference" | "start_date">): CrmBooking {
  return {
    customer_id: "client-1",
    billing_customer_id: "client-1",
    title: "Rome",
    destination: "Rome",
    status: "confirmed",
    end_date: "2026-10-12",
    currency: "EUR",
    total_amount: 1200,
    include_in_ledger: true,
    cover_image_path: null,
    cover_credit: null,
    notes_client: null,
    notes_internal: null,
    visible_to_client: true,
    archived_at: null,
    created_at: "2026-10-01",
    updated_at: "2026-10-01",
    ...partial,
  } as CrmBooking;
}

function entry(
  row: CrmBooking,
  extra: Partial<DashboardWeekEntry<CrmBooking>> = {}
): DashboardWeekEntry<CrmBooking> {
  return { booking: row, group: "soon", mark: null, unseen: false, ...extra };
}

const empty = { travelling: [], soon: [], week: [] };

test("la semaine montre les trois groupes, le retour et le départ pas encore visible", () => {
  const html = renderToStaticMarkup(
    createElement(DashboardWeek, {
      groups: {
        travelling: [entry(booking({ id: "back", reference: "TB-RETOUR", start_date: "2026-10-01", end_date: "2026-10-07" }), { group: "travelling", mark: "retour" })],
        soon: [entry(booking({ id: "soon", reference: "TB-DEMAIN", start_date: "2026-10-08", visible_to_client: false }), { unseen: true })],
        week: [],
      },
      names: new Map([["client-1", "Camille Martin"]]),
      places: { arrival: {}, route: {} },
      amounts: new Map([["soon", 1500]]),
    })
  );
  assert.match(html, /En voyage/);
  assert.match(html, /Aujourd’hui et demain/);
  assert.match(html, /Sous 7 jours/);
  assert.match(html, /TB-RETOUR/);
  assert.match(html, /Retour/);
  assert.match(html, /TB-DEMAIN/);
  assert.match(html, /En préparation/);
  assert.match(html, /border-l-\[var\(--admin-gold\)\]/);
  assert.match(html, /Camille Martin/);
  assert.match(html, /Tout voir/);
  assert.match(html, /Aucun\./);
});

test("sans séjour, la semaine propose un nouveau dossier", () => {
  const html = renderToStaticMarkup(
    createElement(DashboardWeek, {
      groups: empty,
      names: new Map(),
      places: { arrival: {}, route: {} },
      amounts: new Map(),
    })
  );
  assert.match(html, /Aucun séjour cette semaine/);
  assert.match(html, /href="\/admin\/reservations\/nouveau"/);
  assert.doesNotMatch(html, /En voyage/);
});

test("la mise en service ne s’affiche que s’il reste un geste obligatoire", () => {
  const done = buildLaunchItems({
    customerCount: 2,
    customersWithoutPhone: 0,
    bookingCount: 1,
    publishedCount: 1,
    revolutConfigured: true,
    revolutConnected: true,
    stripeConfigured: false,
    stripeWebhookConfigured: false,
  });
  assert.equal(visibleLaunchItems(done).length, 0);
  assert.equal(renderToStaticMarkup(createElement(AdminLaunchStatus, { items: done })), "");

  const open = buildLaunchItems({
    customerCount: 0,
    customersWithoutPhone: 0,
    bookingCount: 0,
    publishedCount: 0,
    revolutConfigured: false,
    revolutConnected: false,
    stripeConfigured: false,
    stripeWebhookConfigured: false,
  });
  const html = renderToStaticMarkup(createElement(AdminLaunchStatus, { items: open }));
  assert.match(html, /Mise en service/);
  assert.match(html, /Fiche client titulaire/);
  assert.doesNotMatch(html, /admin-af-card/);
});
