import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  HOTEL_BUTTON_VISIBILITY_KEY,
  decideAccessRequest,
  decideButtonVisibility,
  decideHotelAccessToggle,
  decideRequestReview,
  hotelButtonVisibilityOf,
  type AccessActor,
  type HotelButtonVisibility,
} from "./hotel-access";

function admin() {
  return createServiceClient();
}

export async function readHotelButtonVisibility(): Promise<HotelButtonVisibility> {
  try {
    const { data, error } = await admin()
      .from("crm_hotel_button_settings")
      .select("value")
      .eq("key", HOTEL_BUTTON_VISIBILITY_KEY)
      .maybeSingle();
    if (error) return "authorized";
    return hotelButtonVisibilityOf((data as { value?: string } | null)?.value);
  } catch {
    return "authorized";
  }
}

export async function writeHotelButtonVisibility(actor: AccessActor, staffId: string | null, value: unknown) {
  const decision = decideButtonVisibility({ actor, value });
  if (!decision.ok) return decision;
  const db = admin();
  const { error } = await db.from("crm_hotel_button_settings").upsert(
    { key: HOTEL_BUTTON_VISIBILITY_KEY, value: decision.value, updated_at: new Date().toISOString(), updated_by: staffId },
    { onConflict: "key" }
  );
  if (error) return { ok: false as const, error: "Le réglage n’a pas été enregistré." };
  await db.from("crm_hotel_button_events").insert({
    key: HOTEL_BUTTON_VISIBILITY_KEY,
    value: decision.value,
    staff_id: staffId,
  });
  return { ok: true as const, value: decision.value };
}

export async function readPendingAccess(customerId: string) {
  const { data } = await admin()
    .from("crm_hotel_access_requests")
    .select("id, status, created_at")
    .eq("customer_id", customerId)
    .eq("status", "pending")
    .maybeSingle();
  return (data as { id: string; status: string; created_at: string } | null) || null;
}

export async function requestHotelAccess(customerId: string, enabled: boolean) {
  const pending = await readPendingAccess(customerId);
  const decision = decideAccessRequest({ enabled, pending: Boolean(pending) });
  if (decision.action !== "created") return { ok: true as const, action: decision.action };
  const { error } = await admin().from("crm_hotel_access_requests").insert({ customer_id: customerId, status: "pending" });
  if (error) {
    if (error.code === "23505") return { ok: true as const, action: "existing" as const };
    return { ok: false as const, error: "La demande n’a pas pu être envoyée." };
  }
  return { ok: true as const, action: "created" as const };
}

export async function writeHotelAccess(input: {
  actor: AccessActor;
  staffId: string | null;
  customerId: string;
  enabled: boolean;
  demo: boolean;
  live: boolean;
}) {
  const decision = decideHotelAccessToggle(input);
  if (!decision.ok) return decision;
  const db = admin();
  const { error } = await db
    .from("crm_customers")
    .update({ hotel_booking_enabled: decision.enabled, hotel_direct_live: decision.live })
    .eq("id", input.customerId);
  if (error) return { ok: false as const, error: "L’accès n’a pas été enregistré." };
  await db.from("crm_hotel_access_events").insert({
    customer_id: input.customerId,
    staff_id: input.staffId,
    enabled: decision.enabled,
    live_mode: decision.live,
  });
  return { ok: true as const, enabled: decision.enabled, live: decision.live };
}

export async function reviewHotelAccess(input: {
  actor: AccessActor;
  staffId: string | null;
  customerId: string;
  decision: "accept" | "refuse";
}) {
  const pending = await readPendingAccess(input.customerId);
  const decision = decideRequestReview({ actor: input.actor, decision: input.decision, pending: Boolean(pending) });
  if (!decision.ok) return decision;
  const db = admin();
  const { error } = await db
    .from("crm_hotel_access_requests")
    .update({ status: decision.status, decided_at: new Date().toISOString(), decided_by: input.staffId })
    .eq("id", pending?.id || "")
    .eq("status", "pending");
  if (error) return { ok: false as const, error: "La demande n’a pas été traitée." };
  if (decision.enabled) {
    const saved = await writeHotelAccess({
      actor: "admin",
      staffId: input.staffId,
      customerId: input.customerId,
      enabled: true,
      demo: false,
      live: false,
    });
    if (!saved.ok) return saved;
  } else {
    await db.from("crm_hotel_access_events").insert({
      customer_id: input.customerId,
      staff_id: input.staffId,
      enabled: false,
      live_mode: false,
    });
  }
  return { ok: true as const, enabled: decision.enabled, status: decision.status };
}
