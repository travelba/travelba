import {
  nativeCalendarFeedback,
  parseNativeCalendarEvents,
  type NativeCalendarFeedback,
  type NativeCalendarOutcome,
} from "@/lib/crm/calendar-native";

type PortalCalendar = {
  addCalendarEvents: (options: { events: ReturnType<typeof parseNativeCalendarEvents> }) => Promise<NativeCalendarOutcome>;
  openSettings: () => Promise<{ ok?: boolean }>;
};

function pluginMissing(error: unknown) {
  const text = error instanceof Error ? `${error.message} ${error.name}` : String(error);
  return /not implemented|unimplemented/i.test(text);
}

/**
 * Ancien binaire : la méthode n’existe pas. La feuille Safari a un bouton OK
 * et peut remettre le fichier à Calendrier. La webview, elle, ne le fait pas.
 */
async function openCalendarInSafariView(href: string): Promise<NativeCalendarFeedback | null> {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) {
      return { text: "Impossible d’ajouter au calendrier.", settings: false };
    }
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: url.toString() });
    return null;
  } catch {
    return { text: "Impossible d’ajouter au calendrier.", settings: false };
  }
}

/** Lit les événements de la même adresse que le .ics, puis les donne à EventKit. */
export async function addStayToIosCalendar(href: string): Promise<NativeCalendarFeedback | null> {
  let events: ReturnType<typeof parseNativeCalendarEvents>;
  try {
    const response = await fetch(href, {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    if (response.status === 400) return { text: "Aucune date à ajouter à l’agenda.", settings: false };
    if (!response.ok) return { text: "Impossible d’ajouter au calendrier.", settings: false };
    events = parseNativeCalendarEvents(await response.json());
  } catch {
    return openCalendarInSafariView(href);
  }
  if (!events.length) return { text: "Aucune date à ajouter à l’agenda.", settings: false };
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const portal = registerPlugin<PortalCalendar>("Portal");
    return nativeCalendarFeedback(await portal.addCalendarEvents({ events }));
  } catch (error) {
    if (pluginMissing(error)) return openCalendarInSafariView(href);
    return { text: "Impossible d’ajouter au calendrier.", settings: false };
  }
}

export async function openCalendarSettings() {
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const portal = registerPlugin<Pick<PortalCalendar, "openSettings">>("Portal");
    await portal.openSettings();
  } catch {
    // Les réglages restent joignables depuis l’icône de l’iPhone.
  }
}
