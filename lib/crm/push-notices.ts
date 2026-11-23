import "server-only";

import { apnsTokenRejected, currentApnsSettings, postApns } from "@/lib/crm/apns";
import { missingDbColumn, queryWithOptionalColumn } from "@/lib/crm/optional-column";
import { pushTargetPath } from "@/lib/crm/native-portal";
import { pushAllowed, type PushPreference, type PushPreferenceRow } from "@/lib/crm/push-copy";
import { createServiceClient } from "@/lib/supabase/admin";

type PushDb = {
  from: (table: string) => {
    select: (columns: string) => PushQuery;
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { code?: string; message?: string } | null }>;
    delete: () => { eq: (column: string, value: string) => PromiseLike<{ error: { code?: string } | null }> };
  };
};

type PushQuery = {
  eq: (column: string, value: string) => PushQuery;
  maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: { code?: string; message?: string } | null }>;
  limit: (n: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { code?: string; message?: string } | null }>;
};

export type CustomerPushInput = {
  customerId: string;
  kind: PushPreference;
  title: string;
  body: string;
  url: string;
  idempotencyKey: string;
  bookingId?: string | null;
  /** La préférence a déjà été lue par l’appelant. */
  preferenceChecked?: boolean;
  /** Le message reste dans l’application même si Apple ne part pas. */
  inApp?: boolean;
};

export type CustomerPushResult = { sent: number; skipped?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function quiet(error: unknown) {
  const message = error instanceof Error ? error.message : "envoi";
  console.error("[push]", message.replace(/[0-9a-f]{32,}/gi, "…").replace(/https?:\/\/\S+/g, "").slice(0, 160));
}

function asDb(client: unknown) {
  return client as PushDb;
}

/**
 * Notification APNs du titulaire. Ne fait rien si les variables manquent,
 * si la préférence est fermée, ou si l’appareil n’est pas enregistré.
 * N’interrompt pas l’appelant.
 */
async function rememberNotice(
  admin: PushDb,
  input: { customerId: string; bookingId: string | null; title: string; body: string; url: string; key: string }
) {
  const inserted = await admin.from("crm_notifications").insert({
    customer_id: input.customerId,
    booking_id: input.bookingId,
    kind: "push",
    title: input.title,
    message: input.body,
    action_url: input.url,
    idempotency_key: input.key,
  });
  if (inserted.error && inserted.error.code !== "23505") quiet(inserted.error.message);
}

export async function sendCustomerPush(input: CustomerPushInput): Promise<CustomerPushResult> {
  try {
    const url = pushTargetPath(input.url);
    const customerId = input.customerId.trim();
    const key = input.idempotencyKey.trim().slice(0, 180);
    const title = input.title.replace(/[\r\n]+/g, " ").trim().slice(0, 80);
    const body = input.body.replace(/[\r\n]+/g, " ").trim().slice(0, 180);
    if (!url || !UUID.test(customerId) || !key || !title || !body) return { sent: 0, skipped: "invalid" };

    const admin = asDb(createServiceClient());
    const existing = await admin.from("crm_notifications").select("id").eq("idempotency_key", key).limit(1);
    if (existing.error) {
      if (existing.error.code === "42P01" || existing.error.code === "PGRST205") return { sent: 0, skipped: "schema" };
      quiet(existing.error.message);
      return { sent: 0, skipped: "error" };
    }
    if ((existing.data || []).length) return { sent: 0, skipped: "already" };

    if (!input.preferenceChecked) {
      const prefs = await queryWithOptionalColumn(
        (columns) =>
          admin.from("crm_notification_preferences").select(columns).eq("customer_id", customerId).maybeSingle(),
        "push_travel, push_documents, push_payment",
        "push_messages"
      );
      if (prefs.error) {
        if (missingDbColumn(prefs.error, "push_travel") || prefs.error.code === "42703" || prefs.error.code === "PGRST204") {
          return { sent: 0, skipped: "schema" };
        }
        if (prefs.error.code === "42P01" || prefs.error.code === "PGRST205") return { sent: 0, skipped: "schema" };
        quiet(prefs.error.message);
        return { sent: 0, skipped: "error" };
      }
      if (!pushAllowed((prefs.data || null) as PushPreferenceRow | null, input.kind)) {
        return { sent: 0, skipped: "preference" };
      }
    }

    const bookingId = input.bookingId && UUID.test(input.bookingId) ? input.bookingId : null;
    const settings = currentApnsSettings();
    if (!settings) {
      if (input.inApp) await rememberNotice(admin, { customerId, bookingId, title, body, url, key });
      return { sent: 0, skipped: "unconfigured" };
    }

    const devices = await admin.from("crm_espace_devices").select("id, token").eq("customer_id", customerId).limit(20);
    if (devices.error) {
      if (devices.error.code === "42P01" || devices.error.code === "PGRST205") return { sent: 0, skipped: "schema" };
      quiet(devices.error.message);
      return { sent: 0, skipped: "error" };
    }
    const rows = (devices.data || []) as { id?: string; token?: string }[];
    const payload = { aps: { alert: { title, body }, sound: "default" }, url };
    let sent = 0;
    for (const row of rows) {
      const token = typeof row.token === "string" ? row.token : "";
      if (!token) continue;
      try {
        const result = await postApns(settings, token, payload);
        if (result.status === 200) sent += 1;
        else if (apnsTokenRejected(result) && row.id && UUID.test(row.id)) {
          await admin.from("crm_espace_devices").delete().eq("id", row.id);
        }
      } catch (error) {
        quiet(error);
      }
    }
    if (!sent && !input.inApp) return { sent: 0, skipped: rows.length ? "rejected" : "no-device" };

    await rememberNotice(admin, { customerId, bookingId, title, body, url, key });
    return sent ? { sent } : { sent: 0, skipped: rows.length ? "rejected" : "no-device" };
  } catch (error) {
    quiet(error);
    return { sent: 0, skipped: "error" };
  }
}
