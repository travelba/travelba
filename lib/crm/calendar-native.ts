import { calendarClickPlan, type CalendarClickPlan } from "./calendar-open";

/** Événement prêt pour EventKit. Les dates sont celles du .ics, sans échappement. */
export type NativeCalendarEvent = {
  uid: string;
  title: string;
  notes: string;
  location: string;
  allDay: boolean;
  /** AAAA-MM-JJ inclus, journée entière. */
  startDate: string;
  /** AAAA-MM-JJ exclus, journée entière. */
  endDate: string;
  /** Heure civile AAAA-MM-JJTHH:mm:ss. */
  start: string;
  end: string;
  timeZone: string;
  endTimeZone: string;
};

export type NativeCalendarOutcome = {
  ok?: boolean;
  added?: number;
  already?: number;
  cancelled?: boolean;
  reason?: string;
};

export type NativeCalendarFeedback = { text: string; settings: boolean };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CIVIL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, max);
}

function zone(value: unknown) {
  if (typeof value !== "string") return "";
  const name = value.trim();
  if (!name || name.length > 80 || !/^[A-Za-z0-9_+\-/]+$/.test(name) || !name.includes("/")) return "";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: name });
    return name;
  } catch {
    return "";
  }
}

/** Garde les événements lisibles. Une ligne cassée est écartée, les autres restent. */
export function parseNativeCalendarEvents(input: unknown): NativeCalendarEvent[] {
  if (!input || typeof input !== "object") return [];
  const rows = (input as { events?: unknown }).events;
  if (!Array.isArray(rows)) return [];
  const events: NativeCalendarEvent[] = [];
  for (const row of rows) {
    if (events.length >= 40) break;
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const title = clip(record.title, 180);
    if (typeof record.uid !== "string" || /[\r\n]/.test(record.uid)) continue;
    const uid = clip(record.uid, 180);
    if (!title || !uid) continue;
    const allDay = record.allDay === true;
    const startDate = typeof record.startDate === "string" && DAY.test(record.startDate) ? record.startDate : "";
    const endDate = typeof record.endDate === "string" && DAY.test(record.endDate) ? record.endDate : "";
    const start = typeof record.start === "string" && CIVIL.test(record.start) ? record.start : "";
    const end = typeof record.end === "string" && CIVIL.test(record.end) ? record.end : "";
    const timeZone = zone(record.timeZone);
    const endTimeZone = zone(record.endTimeZone) || timeZone;
    if (allDay) {
      if (!startDate || !endDate || endDate <= startDate) continue;
    } else if (!start) {
      continue;
    }
    events.push({
      uid,
      title,
      notes: clip(record.notes, 2000),
      location: clip(record.location, 300),
      allDay,
      startDate: allDay ? startDate : "",
      endDate: allDay ? endDate : "",
      start: allDay ? "" : start,
      end: allDay ? "" : end,
      timeZone: allDay ? "" : timeZone,
      endTimeZone: allDay ? "" : endTimeZone,
    });
  }
  return events;
}

/**
 * Application iOS : ne pas ouvrir le .ics dans la webview.
 * Safari, l’écran d’accueil et Android gardent le plan déjà en place.
 */
export function calendarActivation(opts: {
  nativeIos: boolean;
  href: string;
  googleHref?: string | null;
  ua: string;
  navigatorStandalone?: boolean;
  displayModeStandalone?: boolean;
}): { kind: "native"; href: string } | CalendarClickPlan {
  if (opts.nativeIos) return { kind: "native", href: opts.href };
  return calendarClickPlan(opts);
}

/** Texte sous le bouton. `null` : la feuille système suffit, ou l’ajout a été annulé. */
export function nativeCalendarFeedback(result: NativeCalendarOutcome | null): NativeCalendarFeedback | null {
  if (!result) return { text: "Impossible d’ajouter au calendrier.", settings: false };
  if (result.cancelled || result.reason === "busy") return null;
  if (result.reason === "refused") return { text: "L’accès au calendrier est refusé.", settings: true };
  if (result.reason === "unavailable") {
    return { text: "Aucun calendrier n’est disponible sur cet iPhone.", settings: false };
  }
  if (result.reason === "empty") return { text: "Aucune date à ajouter à l’agenda.", settings: false };
  const added = Math.max(0, Math.floor(result.added || 0));
  const already = Math.max(0, Math.floor(result.already || 0));
  if (added === 1) return { text: "Ajouté à votre calendrier.", settings: false };
  if (added > 1) return { text: `${added} événements ajoutés à votre calendrier.`, settings: false };
  if (already > 0) return { text: "Déjà dans votre calendrier.", settings: false };
  return { text: "Impossible d’ajouter au calendrier.", settings: false };
}
