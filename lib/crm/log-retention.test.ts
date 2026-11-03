import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOTEL_ACTIVITY_ACTIONS } from "./hotel-activity";

const retention = readFileSync("supabase/migrations/20261103070000_log_retention.sql", "utf8");
const indexes = readFileSync("supabase/migrations/20261103071000_hotels_index_slim.sql", "utf8");

function sql(source: string) {
  return source
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const retentionSql = sql(retention);
const indexSql = sql(indexes);

test("la rétention ne supprime aucune donnée métier ni le suivi hôtel avant 24 mois", () => {
  const forbidden = [
    "crm_bookings",
    "crm_booking_items",
    "crm_transactions",
    "crm_customers",
    "crm_invoices",
    "crm_payment_methods",
    "crm_revolut_transactions",
    "crm_hotel_search_offers",
    "crm_hotel_search_requests",
    "crm_agency_journal",
    "crm_sent_mail",
    "crm_le_bookings",
    "hotels",
  ];
  for (const table of forbidden) {
    assert.equal(
      new RegExp(`\\b(delete|update)\\s+(from\\s+)?(public\\.)?${table}\\b`, "i").test(retentionSql),
      false,
      table
    );
  }
  assert.match(retentionSql, /interval '12 months'/);
  assert.match(retentionSql, /interval '6 months'/);
  assert.match(retentionSql, /interval '24 months'/);
  assert.doesNotMatch(retentionSql, /delete\s+from\s+public\.crm_email_ingest/i);
  assert.match(retentionSql, /update\s+public\.crm_email_ingest/i);
  assert.match(retentionSql, /status in \('attached', 'refused', 'ignored', 'grouped'\)/);
});

test("le suivi Hôtels reprend exactement les gestes du carnet client", () => {
  for (const action of HOTEL_ACTIVITY_ACTIONS) {
    assert.match(retentionSql, new RegExp(`'${action}'`));
  }
  assert.match(retentionSql, /\/mon-compte\/hotels/);
  assert.match(retentionSql, /security definer/);
  assert.match(retentionSql, /set search_path = public/);
  assert.match(retentionSql, /revoke all on function public\.crm_purge_operational_logs\(\) from public, anon, authenticated/);
  assert.match(retentionSql, /'crm-log-retention'/);
  assert.match(retentionSql, /'15 3 \* \* \*'/);
});

test("on retire les index de contenu jamais lus et on garde ceux qui servent", () => {
  for (const name of [
    "hotels_faq_content_kit_gin",
    "hotels_concierge_questions_gin",
    "hotels_faq_content_gin",
    "hotels_gallery_images_gin",
    "hotels_points_of_interest_gin",
    "hotels_amenities_gin",
    "crm_audit_events_ingest_idx",
    "hotel_rooms_hotel_id_idx",
  ]) {
    assert.match(indexSql, new RegExp(`drop index if exists public\\.${name}`));
  }
  for (const kept of [
    "hotels_affiliations_gin",
    "hotels_pkey",
    "hotels_slug_unique",
    "crm_audit_customer_idx",
    "crm_hotel_search_offers_customer_idx",
    "hotels_brief_pending_gin",
  ]) {
    assert.doesNotMatch(indexSql, new RegExp(`drop index if exists public\\.${kept}`));
  }
  assert.match(indexSql, /hotels_published_city_idx/);
  assert.match(indexSql, /hotels_name_trgm/);
  assert.match(indexSql, /extensions\.gin_trgm_ops/);
  assert.match(indexSql, /crm_customer_activity_action_created_idx/);
  assert.match(indexSql, /crm_hotel_thread_messages_booking_idx/);
});
