import { createServiceClient } from "@/lib/supabase/admin";
import { expoPushMessages } from "@/lib/crm/espace-devices";
import { espacePushPayload, type EspacePushKind } from "@/lib/crm/espace-native";

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

export async function notifyEspaceCustomer(
  customerId: string,
  kind: EspacePushKind,
  input: { reference?: string; place?: string; label?: string }
) {
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_espace_devices")
      .select("token")
      .eq("customer_id", customerId)
      .eq("platform", "ios");
    const tokens = (data || [])
      .map((row) => (typeof row.token === "string" ? row.token : ""))
      .filter(Boolean);
    if (!tokens.length) return { sent: 0 };
    const payload = espacePushPayload(kind, input);
    const messages = expoPushMessages(tokens, {
      title: payload.title,
      body: payload.body,
      data: payload.data,
    });
    const res = await fetch(EXPO_PUSH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return { sent: 0 };
    return { sent: messages.length };
  } catch {
    return { sent: 0 };
  }
}
