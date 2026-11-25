import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isApnsDeviceToken } from "@/lib/crm/apns-token";
import { apnsTokenRejected, currentApnsSettings, postApns } from "@/lib/crm/apns";
import {
  buildLiveActivityPayload,
  flightActivityModel,
  liveActivityAlert,
  liveActivityTopic,
  type FlightActivityModel,
} from "@/lib/crm/live-activity";
import { missingDbColumn } from "@/lib/crm/optional-column";
import type { LiveFlightItem } from "@/lib/crm/next-flight-model";

type Admin = SupabaseClient;

type ActivityRow = {
  id?: string;
  activity_id?: string;
  update_token?: string;
};

export type LiveActivityPushResult = { sent: number; skipped?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function quiet(error: unknown) {
  const message = error instanceof Error ? error.message : "activité";
  console.error("[live-activity]", message.replace(/[0-9a-f]{32,}/gi, "…").replace(/https?:\/\/\S+/g, "").slice(0, 160));
}

function schemaGone(code: string | undefined) {
  return code === "42P01" || code === "PGRST205";
}

function startMarker(itemId: string, token: string) {
  return `start:${itemId}:${token.slice(0, 16)}`;
}

/**
 * Met à jour l’activité en direct du vol. Ne fait rien sans APNS_* ou sans jeton.
 * N’interrompt pas le suivi de vol. iOS plus ancien garde la notification classique.
 */
export async function pushFlightLiveActivity(input: {
  admin: Admin;
  customerId: string;
  bookingId: string;
  itemId: string;
  visible: boolean;
  item: LiveFlightItem;
  now?: Date;
}): Promise<LiveActivityPushResult> {
  try {
    if (!input.visible) return { sent: 0, skipped: "hidden" };
    if (!UUID.test(input.customerId) || !UUID.test(input.itemId)) return { sent: 0, skipped: "invalid" };
    const settings = currentApnsSettings();
    if (!settings) return { sent: 0, skipped: "unconfigured" };
    const now = input.now || new Date();
    const model = flightActivityModel(input.item, now.getTime());
    if (!model || model.event === "none") return { sent: 0, skipped: "window" };

    const listed = await input.admin
      .from("crm_live_activities")
      .select("id, activity_id, update_token")
      .eq("booking_item_id", input.itemId)
      .eq("customer_id", input.customerId)
      .is("ended_at", null);
    if (listed.error) {
      if (schemaGone(listed.error.code)) return { sent: 0, skipped: "schema" };
      quiet(listed.error.message);
      return { sent: 0, skipped: "error" };
    }
    const rows = (listed.data || []) as ActivityRow[];
    const sent = await deliver(input.admin, settings.bundleId, model, rows, now);
    if (model.event === "end") {
      const pending = rows.some(
        (row) => row.activity_id && !row.activity_id.startsWith("start:") && isApnsDeviceToken(row.update_token || "")
      );
      if (sent > 0 || !pending) {
        await input.admin
          .from("crm_live_activities")
          .update({ ended_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("booking_item_id", input.itemId)
          .eq("customer_id", input.customerId)
          .is("ended_at", null);
      }
      return { sent, skipped: sent ? undefined : "no-token" };
    }

    const started = await pushStart(input, settings.bundleId, model, rows, now);
    const total = sent + started.sent;
    return { sent: total, skipped: total ? undefined : started.skipped || "no-token" };
  } catch (error) {
    quiet(error);
    return { sent: 0, skipped: "error" };
  }
}

async function deliver(
  admin: Admin,
  bundleId: string,
  model: FlightActivityModel,
  rows: ActivityRow[],
  now: Date
) {
  const settings = currentApnsSettings();
  if (!settings || model.event === "none") return 0;
  const event = model.event === "end" ? "end" : "update";
  const timestamp = Math.floor(now.getTime() / 1000);
  const alert = event === "end" ? liveActivityAlert("end", model.attributes, model.state) : null;
  const payload = buildLiveActivityPayload({
    event,
    state: model.state,
    timestamp,
    staleDate: model.staleDate,
    dismissalDate: event === "end" ? timestamp + 30 * 60 : null,
    alert,
  });
  if (!payload) return 0;
  let sent = 0;
  for (const row of rows) {
    const activityId = row.activity_id || "";
    const token = row.update_token || "";
    if (activityId.startsWith("start:") || !isApnsDeviceToken(token)) continue;
    try {
      const result = await postApns(settings, token, payload, {
        pushType: "liveactivity",
        topic: liveActivityTopic(bundleId),
      });
      if (result.status === 200) sent += 1;
      else if (apnsTokenRejected(result) && row.id) {
        await admin
          .from("crm_live_activities")
          .update({ ended_at: now.toISOString(), updated_at: now.toISOString() })
          .eq("id", row.id);
      }
    } catch (error) {
      quiet(error);
    }
  }
  return sent;
}

async function pushStart(
  input: {
    admin: Admin;
    customerId: string;
    itemId: string;
    bookingId: string;
  },
  bundleId: string,
  model: FlightActivityModel,
  rows: ActivityRow[],
  now: Date
) {
  if (rows.some((row) => row.activity_id && !row.activity_id.startsWith("start:") && isApnsDeviceToken(row.update_token || ""))) {
    return { sent: 0, skipped: "running" };
  }
  const settings = currentApnsSettings();
  if (!settings) return { sent: 0, skipped: "unconfigured" };
  const devices = await input.admin
    .from("crm_espace_devices")
    .select("id, live_start_token")
    .eq("customer_id", input.customerId)
    .limit(20);
  if (devices.error) {
    if (schemaGone(devices.error.code) || missingDbColumn(devices.error, "live_start_token")) {
      return { sent: 0, skipped: "schema" };
    }
    quiet(devices.error.message);
    return { sent: 0, skipped: "error" };
  }
  const timestamp = Math.floor(now.getTime() / 1000);
  const payload = buildLiveActivityPayload({
    event: "start",
    attributes: model.attributes,
    state: model.state,
    timestamp,
    staleDate: model.staleDate,
    alert: liveActivityAlert("start", model.attributes, model.state),
  });
  if (!payload) return { sent: 0, skipped: "invalid" };
  let sent = 0;
  for (const device of (devices.data || []) as { id?: string; live_start_token?: string | null }[]) {
    const token = typeof device.live_start_token === "string" ? device.live_start_token : "";
    if (!isApnsDeviceToken(token)) continue;
    const marker = startMarker(input.itemId, token);
    if (rows.some((row) => row.activity_id === marker)) continue;
    try {
      const result = await postApns(settings, token, payload, {
        pushType: "liveactivity",
        topic: liveActivityTopic(bundleId),
      });
      if (result.status !== 200) continue;
      sent += 1;
      const inserted = await input.admin.from("crm_live_activities").insert({
        customer_id: input.customerId,
        booking_item_id: input.itemId,
        activity_id: marker,
        update_token: `marker:${marker}`,
        updated_at: now.toISOString(),
      });
      if (inserted.error && inserted.error.code !== "23505") quiet(inserted.error.message);
    } catch (error) {
      quiet(error);
    }
  }
  return { sent, skipped: sent ? undefined : "no-token" };
}
