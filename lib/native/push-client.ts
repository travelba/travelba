import { isApnsDeviceToken } from "@/lib/crm/apns-token";
import { pushDefaultsPatch, shouldRequestIosPush } from "@/lib/crm/push-permission";

const TOKEN_KEY = "tba.apns.token";
const DEFAULTS_KEY = "tba.push.defaults";

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
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* session privée */
  }
}

async function preferences() {
  const { Preferences } = await import("@capacitor/preferences");
  return Preferences;
}

async function persistToken(token: string) {
  rememberToken(token);
  const store = await preferences();
  if (token) await store.set({ key: TOKEN_KEY, value: token }).catch(() => {});
  else await store.remove({ key: TOKEN_KEY }).catch(() => {});
}

async function loadToken() {
  const current = rememberedToken();
  if (isApnsDeviceToken(current)) return current;
  const store = await preferences();
  const saved = await store.get({ key: TOKEN_KEY }).catch(() => ({ value: null }));
  const token = (saved.value || "").replace(/\s+/g, "");
  if (!isApnsDeviceToken(token)) return "";
  rememberToken(token);
  return token;
}

async function publishToken(token: string) {
  if (!isApnsDeviceToken(token)) return;
  const response = await fetch("/api/client/devices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ token, platform: "ios" }),
  }).catch(() => null);
  if (!response || response.status === 401) return;
  if (response.ok) await enableDefaultPreferences();
}

/** Une fois, après l’accord iOS et la connexion. Les choix suivants du profil restent. */
async function enableDefaultPreferences() {
  const store = await preferences();
  const done = await store.get({ key: DEFAULTS_KEY }).catch(() => ({ value: null }));
  if (done.value === "1") return;
  const response = await fetch("/api/client/notifications", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(pushDefaultsPatch()),
  }).catch(() => null);
  if (response?.ok) await store.set({ key: DEFAULTS_KEY, value: "1" }).catch(() => {});
}

let listenersReady = false;

async function attachListeners() {
  if (listenersReady) return;
  listenersReady = true;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener("registration", (token) => {
    const value = token.value.replace(/\s+/g, "");
    if (!isApnsDeviceToken(value)) return;
    void persistToken(value);
    void import("@/lib/native/widgets").then((mod) => mod.flushLiveActivityTokens());
    void publishToken(value);
  });
  await PushNotifications.addListener("pushNotificationReceived", () => {
    void import("@/lib/native/widgets").then((mod) => mod.refreshNativeWidgets({ force: true }));
  });
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = action.notification?.data?.url;
    if (typeof url === "string" && url.startsWith("/mon-compte")) location.assign(url);
    void import("@/lib/native/widgets").then((mod) => mod.refreshNativeWidgets({ force: true }));
  });
}

/**
 * Demande native iOS (alerte, son, badge), dès le premier écran.
 * iOS ne la montre qu’une fois. Le jeton est gardé sur l’appareil jusqu’à la connexion.
 */
export async function askIosNotificationPermission() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await attachListeners();
  const current = await PushNotifications.checkPermissions();
  const perm = shouldRequestIosPush(current.receive) ? await PushNotifications.requestPermissions() : current;
  if (perm.receive !== "granted") return perm.receive;
  await PushNotifications.register();
  await PushNotifications.removeAllDeliveredNotifications().catch(() => {});
  return "granted" as const;
}

/** Après la connexion : envoie le jeton déjà obtenu, et ouvre toutes les catégories une fois. */
export async function registerNativePush() {
  await askIosNotificationPermission().catch(() => {});
  const token = await loadToken();
  if (token) await publishToken(token);
}

export async function iosPushDenied() {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const current = await PushNotifications.checkPermissions();
    return current.receive === "denied";
  } catch {
    return false;
  }
}

export async function openIosNotificationSettings() {
  const { registerPlugin } = await import("@capacitor/core");
  const Portal = registerPlugin<{ openSettings: () => Promise<{ ok?: boolean }> }>("Portal");
  await Portal.openSettings();
}

/** Retire cet appareil, ou tous les appareils si la déconnexion est globale. */
export async function unregisterNativePush(all = false) {
  const token = (await loadToken()) || rememberedToken();
  if (!all && !token) return;
  await fetch("/api/client/devices", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(all ? { all: true } : { token }),
  }).catch(() => {});
  rememberToken("");
}
