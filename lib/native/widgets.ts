import { isApnsDeviceToken } from "@/lib/crm/apns-token";
import { isNativeAppBridge } from "@/lib/native/detect";
import { nativeDeviceToken } from "@/lib/native/push-client";

type LiveTokenEvent = {
  pushToStartToken?: string;
  activityId?: string;
  updateToken?: string;
  itemId?: string;
  flightNumber?: string;
  ended?: boolean;
};

type PortalWidgets = {
  armLiveActivities: () => Promise<{ ok: boolean }>;
  syncWidgets: (options: { snapshot: string }) => Promise<{ ok: boolean }>;
  addListener: (event: "liveActivityToken", handler: (event: LiveTokenEvent) => void) => Promise<{ remove: () => void }>;
};

const EMPTY = JSON.stringify({
  updatedAt: new Date(0).toISOString(),
  trip: null,
  flight: null,
  weather: null,
  live: null,
});

let armed = false;
let lastFetch = 0;
let pendingStart = "";
const seen = new Set<string>();

async function portal() {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin<PortalWidgets>("Portal");
}

async function publishToken(event: LiveTokenEvent) {
  const deviceToken = nativeDeviceToken();
  const pushToStartToken = event.pushToStartToken && isApnsDeviceToken(event.pushToStartToken) ? event.pushToStartToken : "";
  const updateToken = event.updateToken && isApnsDeviceToken(event.updateToken) ? event.updateToken : "";
  if (pushToStartToken) pendingStart = pushToStartToken;
  if (pushToStartToken && !deviceToken && !updateToken && !event.ended) return;
  if (!pushToStartToken && !updateToken && !event.ended) return;
  if (event.ended && event.activityId) {
    const key = `end:${event.activityId}`;
    if (seen.has(key)) return;
    seen.add(key);
    await fetch("/api/client/live-activity", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ activityId: event.activityId }),
    }).catch(() => {
      seen.delete(key);
    });
    return;
  }
  const key = [pushToStartToken, event.activityId || "", updateToken].join(":");
  if (seen.has(key)) return;
  seen.add(key);
  const activity =
    event.activityId && updateToken
      ? {
          id: event.activityId,
          token: updateToken,
          itemId: event.itemId || undefined,
          flightNumber: event.flightNumber || undefined,
          ended: false,
        }
      : undefined;
  if (activity && !isApnsDeviceToken(activity.token)) return;
  await fetch("/api/client/live-activity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      deviceToken: deviceToken || undefined,
      pushToStartToken: deviceToken && pushToStartToken ? pushToStartToken : undefined,
      activity,
    }),
  }).catch(() => {
    seen.delete(key);
  });
}

/** Renvoie le jeton push-to-start une fois l’appareil enregistré. */
export async function flushLiveActivityTokens() {
  if (!pendingStart || !nativeDeviceToken()) return;
  await publishToken({ pushToStartToken: pendingStart });
}

/** Écoute les jetons d’activité. Une seule fois par lancement. */
export async function armNativeWidgets() {
  if (!isNativeAppBridge() || armed) return;
  armed = true;
  try {
    const plugin = await portal();
    await plugin.addListener("liveActivityToken", (event) => {
      void publishToken(event);
    });
    await plugin.armLiveActivities();
  } catch {
    armed = false;
  }
}

/**
 * Relit le résumé et le donne à l’application, qui écrit le groupe et recharge les widgets.
 * Au premier plan et après une notification de vol. Hors de l’application : rien.
 */
export async function refreshNativeWidgets(options?: { force?: boolean }) {
  if (!isNativeAppBridge()) return;
  if (!location.pathname.startsWith("/mon-compte")) return;
  const now = Date.now();
  if (!options?.force && now - lastFetch < 10_000) return;
  lastFetch = now;
  try {
    await armNativeWidgets();
    const plugin = await portal();
    const response = await fetch("/api/client/widgets", { credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) {
      await plugin.syncWidgets({ snapshot: EMPTY });
      return;
    }
    if (!response.ok) return;
    const snapshot = await response.json();
    await plugin.syncWidgets({ snapshot: JSON.stringify(snapshot) });
  } catch {
    lastFetch = 0;
  }
}
