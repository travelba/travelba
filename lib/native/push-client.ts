import { isApnsDeviceToken } from "@/lib/crm/apns-token";

const TOKEN_KEY = "tba.apns.token";

export function nativeDeviceToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function rememberedToken() {
  return nativeDeviceToken();
}

function rememberToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* session privée */
  }
}

let pushRegistered = false;

/** Demande la permission et enregistre le jeton. Un second appel ne redemande rien. */
export async function registerNativePush() {
  if (pushRegistered) return;
  pushRegistered = true;
  try {
    await attachNativePush();
  } catch (error) {
    pushRegistered = false;
    throw error;
  }
}

async function attachNativePush() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener("registration", (token) => {
    const value = token.value.replace(/\s+/g, "");
    if (!isApnsDeviceToken(value)) return;
    rememberToken(value);
    void import("@/lib/native/widgets").then((mod) => mod.flushLiveActivityTokens());
    void fetch("/api/client/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token: value, platform: "ios" }),
    }).catch(() => {});
  });
  await PushNotifications.addListener("pushNotificationReceived", () => {
    void import("@/lib/native/widgets").then((mod) => mod.refreshNativeWidgets({ force: true }));
  });
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = action.notification?.data?.url;
    if (typeof url === "string" && url.startsWith("/mon-compte")) location.assign(url);
    void import("@/lib/native/widgets").then((mod) => mod.refreshNativeWidgets({ force: true }));
  });
  const current = await PushNotifications.checkPermissions();
  const perm = current.receive === "granted" ? current : await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;
  await PushNotifications.register();
  await PushNotifications.removeAllDeliveredNotifications().catch(() => {});
}

/** Retire cet appareil, ou tous les appareils si la déconnexion est globale. */
export async function unregisterNativePush(all = false) {
  const token = rememberedToken();
  if (!all && !token) return;
  await fetch("/api/client/devices", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(all ? { all: true } : { token }),
  }).catch(() => {});
  rememberToken("");
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* déjà vide */
  }
}
