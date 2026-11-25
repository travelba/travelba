import { biometricChoiceOf, shouldLockWithBiometric, shouldRestoreWithBiometric } from "@/lib/crm/biometric-lock";
import { BIOMETRIC_PREF_KEY } from "@/lib/native/end-session";
import { portalNavigation, pushTargetPath } from "@/lib/crm/native-portal";
import { isNativeAppBridge } from "@/lib/native/detect";
import { askIosNotificationPermission, registerNativePush } from "@/lib/native/push-client";

const TRIP_KEY = "tba.trip";
const BIOMETRIC_KEY = BIOMETRIC_PREF_KEY;

function openExternal(url: string) {
  void import("@capacitor/browser").then(({ Browser }) => Browser.open({ url })).catch(() => {});
}

function guardClicks() {
  document.addEventListener(
    "click",
    (event) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#")) return;
      const decision = portalNavigation({ url: href, base: location.href });
      if (decision === "allow" || decision === "system") return;
      event.preventDefault();
      event.stopPropagation();
      if (decision === "external") {
        openExternal(new URL(href, location.href).toString());
      }
    },
    true
  );
}

async function shareData(data: ShareData) {
  const { Share } = await import("@capacitor/share");
  const files = data.files ? Array.from(data.files) : [];
  if (files.length) {
    const { Directory, Filesystem } = await import("@capacitor/filesystem");
    const uris: string[] = [];
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      const step = 0x8000;
      for (let index = 0; index < bytes.length; index += step) {
        binary += String.fromCharCode(...bytes.subarray(index, index + step));
      }
      const safe = (file.name || "document").replace(/[^\w.\- ]+/g, "").slice(0, 80) || "document";
      const written = await Filesystem.writeFile({
        path: safe,
        data: btoa(binary),
        directory: Directory.Cache,
      });
      uris.push(written.uri);
    }
    await Share.share({ title: data.title, text: data.text, files: uris });
    return;
  }
  await Share.share({ title: data.title, text: data.text, url: data.url });
}

function installShare() {
  const share = async (data: ShareData) => {
    try {
      await shareData(data || {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/cancel/i.test(message)) {
        throw new DOMException("Partage annulé", "AbortError");
      }
      throw error;
    }
  };
  const canShare = (data?: ShareData) => Boolean(data && (data.url || data.text || data.title || data.files?.length));
  try {
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: canShare });
  } catch {
    /* le partage du navigateur reste */
  }
}

async function rememberTrip() {
  const node = document.querySelector("[data-tba-trip]");
  if (!node) return;
  const title = (node.getAttribute("data-tba-title") || "").trim().slice(0, 140);
  const when = (node.getAttribute("data-tba-when") || "").trim().slice(0, 80);
  const href = pushTargetPath(node.getAttribute("data-tba-href") || "");
  if (!title || !href) return;
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.set({ key: TRIP_KEY, value: JSON.stringify({ title, when, href }) });
}

function watchTrip() {
  const snapshot = () => {
    void rememberTrip();
  };
  snapshot();
  const observer = new MutationObserver(snapshot);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tba-title"] });
}

async function biometricChoice() {
  const { Preferences } = await import("@capacitor/preferences");
  const stored = await Preferences.get({ key: BIOMETRIC_KEY });
  return biometricChoiceOf(stored.value);
}

async function restoreSession(token: string) {
  const response = await fetch("/api/client/device-unlock/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ token }),
  });
  if (response.ok) return "ok" as const;
  if (response.status === 401) return "invalid" as const;
  return "offline" as const;
}

async function showPasswordForm() {
  document.getElementById("tba-lock")?.remove();
  if (!location.pathname.startsWith("/mon-compte")) return;
  const { signOutAccount } = await import("@/lib/crm/account-sign-out");
  await signOutAccount("local", "/connexion", { keepUnlock: true });
}

async function lockScreen() {
  let root = document.getElementById("tba-lock");
  if (!root) {
    root = document.createElement("div");
    root.id = "tba-lock";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Déverrouiller TBA");
    root.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:80",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "gap:16px",
      "padding:32px",
      "background:#0B192C",
      "color:#FAF9F6",
      "text-align:center",
      "font-family:var(--font-plus-jakarta),system-ui,sans-serif",
    ].join(";");
    root.innerHTML = `
      <p style="margin:0;letter-spacing:.22em;font-size:13px;color:#C5A880">TRAVEL BUSINESS AGENCY</p>
      <p style="margin:0;font-size:40px;font-weight:700;letter-spacing:-.03em">TBA</p>
      <p style="margin:0;max-width:18rem;line-height:1.4;color:#C9BFB2">Déverrouillez l’application pour retrouver votre séjour.</p>
      <button type="button" data-unlock style="margin-top:8px;border:0;border-radius:999px;background:#C5A880;color:#0B192C;font-weight:700;padding:12px 22px">Déverrouiller</button>
      <button type="button" data-password style="border:0;background:transparent;color:#C5A880;font-weight:600;padding:8px 12px">Utiliser le mot de passe</button>
    `;
    document.body.appendChild(root);
    root.querySelector("[data-unlock]")?.addEventListener("click", () => {
      void promptUnlock();
    });
    root.querySelector("[data-password]")?.addEventListener("click", () => {
      void showPasswordForm();
    });
  }
  root.hidden = false;
  await promptUnlock();
}

async function promptUnlock() {
  const { readUnlockToken } = await import("@/lib/native/device-lock");
  try {
    const token = await readUnlockToken();
    if (!token) return;
    const restored = await restoreSession(token);
    if (restored === "invalid") {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: BIOMETRIC_KEY, value: "off" });
      const { clearUnlockToken } = await import("@/lib/native/device-lock");
      await clearUnlockToken();
      await showPasswordForm();
      return;
    }
    document.getElementById("tba-lock")?.remove();
    if (restored === "ok" && (location.pathname === "/connexion" || location.pathname.startsWith("/connexion/"))) {
      location.assign(new URL("/mon-compte", location.origin).href);
    }
  } catch {
    /* l’écran reste, le bouton réessaie */
  }
}

/** Pont natif. Ne fait rien hors de l’application. */
async function startNativeShell() {
  if (!isNativeAppBridge()) return;
  const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
    import("@capacitor/app"),
  ]);
  await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
  await StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  await StatusBar.setBackgroundColor({ color: "#FAF9F6" }).catch(() => {});
  guardClicks();
  installShare();
  watchTrip();
  void askIosNotificationPermission().catch(() => {});

  let hiddenAt = 0;
  await App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) {
      hiddenAt = Date.now();
      return;
    }
    const elapsed = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    void import("@/lib/native/widgets").then((mod) => mod.refreshNativeWidgets({ force: true }));
    void biometricChoice().then((choice) => {
      if (shouldLockWithBiometric(choice, elapsed, location.pathname)) void lockScreen();
    });
  });
  await App.addListener("appUrlOpen", ({ url }) => {
    const decision = portalNavigation({ url });
    if (decision === "system" || decision === "allow") location.assign(url);
    else if (decision === "external") openExternal(url);
  });

  const choice = await biometricChoice();
  if (shouldRestoreWithBiometric(choice, location.pathname)) await lockScreen();
  await syncNativeRoute(location.pathname);
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("/tba-sw.js").catch(() => {});
  }
  await SplashScreen.hide().catch(() => {});
}

let booted = false;

/** Une seule installation des ponts natifs. Les visites suivantes passent par `syncNativeRoute`. */
export async function bootNativeApp() {
  if (!isNativeAppBridge() || booted) {
    return;
  }
  booted = true;
  await startNativeShell();
}

/** Après une connexion (navigation client vers /mon-compte), demande le jeton une fois. */
export async function syncNativeRoute(pathname: string) {
  if (!isNativeAppBridge()) return;
  if (!pathname.startsWith("/mon-compte")) return;
  await registerNativePush().catch(() => {});
  const widgets = await import("@/lib/native/widgets");
  await widgets.armNativeWidgets().catch(() => {});
  await widgets.refreshNativeWidgets().catch(() => {});
}
