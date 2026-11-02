/** Notification du navigateur. Rien si l’agence n’a pas autorisé, ou si iOS refuse hors écran d’accueil. */

export function browserAlertsGranted() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export function browserAlert(title: string, body: string) {
  if (!browserAlertsGranted()) return;
  const text = body.replace(/\s+/g, " ").trim().slice(0, 140);
  try {
    new Notification(title, { body: text || title });
  } catch {
    // Safari iOS ne montre rien tant que le site n’est pas sur l’écran d’accueil.
  }
}

/** Le premier geste dans l’admin demande l’autorisation, une seule fois. */
export function askBrowserAlerts() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  void Notification.requestPermission().catch(() => undefined);
}
