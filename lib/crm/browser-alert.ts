/** Notification du navigateur. Rien si l’agence n’a pas autorisé, ou si iOS refuse hors écran d’accueil. */

export const BROWSER_ALERT_MEMORY_KEY = "tba-admin-browser-alerts";
export const BROWSER_ALERT_OPEN = "tba-admin-notification-open";
export const BROWSER_ALERT_CHANGE = "tba-admin-browser-alert-change";

export type BrowserPermission = "default" | "granted" | "denied";
export type BrowserAlertChoice = "ask" | "granted" | "denied" | "later" | "unsupported";
export type BrowserAlertMemory = "later" | "denied-seen" | "unsupported-seen";

export function browserAlertChoice(input: {
  supported: boolean;
  permission: BrowserPermission;
  memory: string | null;
}): BrowserAlertChoice {
  if (!input.supported) return "unsupported";
  if (input.permission === "granted") return "granted";
  if (input.permission === "denied") return "denied";
  if (input.memory === "later") return "later";
  return "ask";
}

/** Bandeau à montrer une fois. Plus tard, bloqué et indisponible ne reviennent pas tout seuls. */
export function browserAlertBanner(choice: BrowserAlertChoice, memory: string | null) {
  if (choice === "ask") return "ask" as const;
  if (choice === "denied" && memory !== "denied-seen") return "denied" as const;
  if (choice === "unsupported" && memory !== "unsupported-seen") return "unsupported" as const;
  return null;
}

export function browserAlertStatus(choice: BrowserAlertChoice) {
  if (choice === "granted") return { action: null, note: "Notifications du navigateur activées" };
  if (choice === "denied") {
    return {
      action: null,
      note: "Notifications du navigateur bloquées. Autorisez-les dans les réglages du navigateur.",
    };
  }
  if (choice === "unsupported") {
    return { action: null, note: "Notifications du navigateur indisponibles sur ce navigateur." };
  }
  return { action: "Activer les notifications", note: null };
}

export function browserAlertsSupported() {
  return typeof Notification !== "undefined" && typeof Notification.requestPermission === "function";
}

export function browserAlertsGranted() {
  return browserAlertsSupported() && Notification.permission === "granted";
}

export function readBrowserAlertMemory() {
  try {
    return localStorage.getItem(BROWSER_ALERT_MEMORY_KEY);
  } catch {
    return null;
  }
}

export function writeBrowserAlertMemory(value: BrowserAlertMemory) {
  try {
    localStorage.setItem(BROWSER_ALERT_MEMORY_KEY, value);
  } catch {
    // Le choix reste dans cet onglet.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BROWSER_ALERT_CHANGE));
}

export type BrowserAlertOpenDetail = { id: string; href: string };

export function browserAlert(input: { id: string; title: string; body: string; href: string }) {
  if (!browserAlertsGranted() || !input.id || !input.href) return;
  const text = input.body.replace(/\s+/g, " ").trim().slice(0, 180);
  try {
    const notification = new Notification(input.title, {
      body: text || input.title,
      tag: input.id,
      lang: "fr",
      icon: "/icon-192.png",
    });
    notification.onclick = (event) => {
      event.preventDefault();
      window.focus();
      notification.close();
      window.dispatchEvent(
        new CustomEvent<BrowserAlertOpenDetail>(BROWSER_ALERT_OPEN, {
          detail: { id: input.id, href: input.href },
        })
      );
    };
  } catch {
    // Safari iOS ne montre rien tant que le site n’est pas sur l’écran d’accueil.
  }
}

/** Geste explicite. Le navigateur ne redemande pas si le choix est déjà fait. */
export function askBrowserAlerts(): Promise<"granted" | "denied" | "unsupported"> {
  if (!browserAlertsSupported()) {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(BROWSER_ALERT_CHANGE));
    return Promise.resolve("unsupported");
  }
  let pending: Promise<NotificationPermission>;
  try {
    pending = Notification.requestPermission();
  } catch {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(BROWSER_ALERT_CHANGE));
    return Promise.resolve("unsupported");
  }
  return Promise.resolve(pending)
    .then((result) => {
      if (typeof window !== "undefined") window.dispatchEvent(new Event(BROWSER_ALERT_CHANGE));
      return result === "granted" ? "granted" : "denied";
    })
    .catch(() => {
      if (typeof window !== "undefined") window.dispatchEvent(new Event(BROWSER_ALERT_CHANGE));
      return "unsupported" as const;
    });
}
