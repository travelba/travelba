import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReservationWeek } from "../../components/admin/ReservationWeek";
import { reservationWeek, type ReservationWeekColumn } from "./reservation-week";
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

function board(columns: ReservationWeekColumn<CrmBooking>[]) {
  return renderToStaticMarkup(
    createElement(ReservationWeek, {
      columns,
      names: new Map([["client-1", "Camille Martin"]]),
      places: { arrival: {}, route: {} },
      amounts: new Map([["soon", 1500]]),
    })
  );
}

test("un jour sans séjour se replie, les autres restent des cartes du projet", () => {
  const columns = reservationWeek(
    [
      booking({ id: "back", reference: "TB-RETOUR", start_date: "2026-10-01", end_date: "2026-10-07" }),
      booking({ id: "away", reference: "TB-VOYAGE", start_date: "2026-10-02", end_date: "2026-10-10" }),
      booking({ id: "soon", reference: "TB-DEMAIN", start_date: "2026-10-08", visible_to_client: false }),
      booking({ id: "later", reference: "TB-PLUS", start_date: "2026-10-20", end_date: "2026-10-22" }),
    ],
    "2026-10-07"
  );
  const html = board(columns);
  assert.match(html, /Aujourd’hui/);
  assert.match(html, /Semaine pro/);
  assert.match(html, /Plus tard/);
  assert.match(html, /admin-af-card/);
  assert.match(html, /TB-RETOUR/);
  assert.match(html, /Retour/);
  assert.match(html, /En voyage/);
  assert.match(html, /TB-DEMAIN/);
  assert.match(html, /En préparation/);
  assert.match(html, /border-l-\[var\(--admin-gold\)\]/);
  assert.match(html, /Camille Martin/);
  assert.match(html, /Vendredi, aucun séjour/);
  assert.match(html, /Semaine pro, aucun séjour/);
  assert.match(html, /TB-PLUS/);
  assert.match(html, /20 oct\./);
  assert.doesNotMatch(html, /Plus tard, aucun séjour/);
  assert.equal(html.split('data-folded="true"').length - 1, 4);
  assert.doesNotMatch(html, /#f1f2f4/);
  assert.doesNotMatch(html, /#e6e0d4/);
  assert.doesNotMatch(html, /w-\[272px\]/);
  assert.doesNotMatch(html, /Jeudi, aucun séjour/);
});

test("sans séjour à venir, l’onglet propose un nouveau dossier", () => {
  const html = renderToStaticMarkup(
    createElement(ReservationWeek, {
      columns: reservationWeek([], "2026-10-07"),
      names: new Map(),
      places: { arrival: {}, route: {} },
      amounts: new Map(),
    })
  );
  assert.match(html, /Aucun dossier à venir/);
  assert.match(html, /href="\/admin\/reservations\/nouveau"/);
  assert.doesNotMatch(html, /data-folded/);
});
