import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { clientTripOwnerIds } from "@/lib/crm/company-peers";
import { parseLiveActivityEnd, parseLiveActivityRegistration } from "@/lib/crm/live-activity";
import { isActiveItem, type CrmBookingItem, type CrmCustomer } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function schemaMissing(code: string | undefined) {
  return code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204";
}

function compactFlight(value: string) {
  return value.toUpperCase().replace(/\s+/g, "");
}

async function ownedFlight(
  customer: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">,
  itemId: string | null,
  flightNumber: string | null
) {
  const admin = createServiceClient();
  const owners = await clientTripOwnerIds(customer);
  const bookings = await admin
    .from("crm_bookings")
    .select("id")
    .in("customer_id", owners)
    .eq("visible_to_client", true)
    .is("archived_at", null);
  if (bookings.error) return { error: bookings.error, item: null as { id: string } | null };
  const ids = ((bookings.data || []) as { id: string }[]).map((row) => row.id);
  if (!ids.length) return { error: null, item: null };
  const items = await admin
    .from("crm_booking_items")
    .select("id, kind, start_at, details, visible_to_client, lifecycle")
    .in("booking_id", ids)
    .eq("kind", "flight");
  if (items.error) return { error: items.error, item: null };
  const rows = ((items.data || []) as Pick<CrmBookingItem, "id" | "kind" | "start_at" | "details" | "visible_to_client" | "lifecycle">[]).filter(
    (row) => row.visible_to_client !== false && isActiveItem(row)
  );
  if (itemId) {
    const found = rows.find((row) => row.id === itemId);
    if (found) return { error: null, item: { id: found.id } };
  }
  const wanted = compactFlight(flightNumber || "");
  if (!wanted) return { error: null, item: null };
  const matches = rows
    .filter((row) => compactFlight(String(row.details?.flight_number || "")) === wanted)
    .sort((a, b) => (a.start_at || "").localeCompare(b.start_at || ""));
  const today = new Date().toISOString().slice(0, 10);
  const next = matches.find((row) => (row.start_at || "") >= today) || matches[matches.length - 1] || null;
  return { error: null, item: next ? { id: next.id } : null };
}

/** Enregistre le jeton push-to-start ou le jeton de mise à jour d’une activité. */
export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const parsed = parseLiveActivityRegistration(await request.json().catch(() => null));
  if (!parsed.ok) return jsonError(parsed.error);
  const admin = createServiceClient();
  const now = new Date().toISOString();

  if (parsed.value.pushToStartToken && parsed.value.deviceToken) {
    const device = await admin
      .from("crm_espace_devices")
      .select("id")
      .eq("customer_id", auth.customer.id)
      .eq("token", parsed.value.deviceToken)
      .maybeSingle();
    if (device.error) {
      if (schemaMissing(device.error.code)) return jsonError("Le suivi en direct n’est pas encore ouvert.", 503);
      console.error("[live-activity]", device.error.code ?? "?");
      return jsonError("Le jeton n’a pas pu être enregistré.");
    }
    if (!device.data) {
      if (!parsed.value.activity) return jsonError("Appareil inconnu.");
    } else {
      const saved = await admin
        .from("crm_espace_devices")
        .update({ live_start_token: parsed.value.pushToStartToken, live_start_token_at: now, updated_at: now })
        .eq("id", device.data.id);
      if (saved.error) {
        if (schemaMissing(saved.error.code)) return jsonError("Le suivi en direct n’est pas encore ouvert.", 503);
        console.error("[live-activity]", saved.error.code ?? "?");
        return jsonError("Le jeton n’a pas pu être enregistré.");
      }
    }
  }

  const activity = parsed.value.activity;
  if (activity) {
    const owned = await ownedFlight(auth.customer, activity.itemId, activity.flightNumber);
    if (owned.error) {
      if (schemaMissing(owned.error.code)) return jsonError("Le suivi en direct n’est pas encore ouvert.", 503);
      console.error("[live-activity]", owned.error.code ?? "?");
      return jsonError("Le vol n’a pas pu être vérifié.");
    }
    if (!owned.item) return jsonError("Vol introuvable.");
    if (activity.ended) {
      const ended = await admin
        .from("crm_live_activities")
        .update({ ended_at: now, updated_at: now })
        .eq("customer_id", auth.customer.id)
        .eq("activity_id", activity.id);
      if (ended.error && !schemaMissing(ended.error.code)) {
        console.error("[live-activity]", ended.error.code ?? "?");
        return jsonError("L’activité n’a pas pu être fermée.");
      }
      return NextResponse.json({ ok: true });
    }
    const removed = await admin
      .from("crm_live_activities")
      .delete()
      .eq("customer_id", auth.customer.id)
      .eq("activity_id", activity.id);
    if (removed.error && !schemaMissing(removed.error.code)) {
      console.error("[live-activity]", removed.error.code ?? "?");
      return jsonError("Le jeton n’a pas pu être enregistré.");
    }
    const inserted = await admin.from("crm_live_activities").insert({
      customer_id: auth.customer.id,
      booking_item_id: owned.item.id,
      activity_id: activity.id,
      update_token: activity.token,
      updated_at: now,
    });
    if (inserted.error) {
      if (schemaMissing(inserted.error.code)) return jsonError("Le suivi en direct n’est pas encore ouvert.", 503);
      if (inserted.error.code !== "23505") {
        console.error("[live-activity]", inserted.error.code ?? "?");
        return jsonError("Le jeton n’a pas pu être enregistré.");
      }
    }
  }
  return NextResponse.json({ ok: true });
}

/** Ferme une activité de ce titulaire. */
export async function DELETE(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const parsed = parseLiveActivityEnd(await request.json().catch(() => null));
  if (!parsed) return jsonError("Activité introuvable.");
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const ended = await admin
    .from("crm_live_activities")
    .update({ ended_at: now, updated_at: now })
    .eq("customer_id", auth.customer.id)
    .eq("activity_id", parsed.activityId);
  if (ended.error && !schemaMissing(ended.error.code)) {
    console.error("[live-activity]", ended.error.code ?? "?");
    return jsonError("L’activité n’a pas pu être fermée.");
  }
  return NextResponse.json({ ok: true });
}
