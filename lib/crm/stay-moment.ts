export type StayMoment = "before" | "travelling" | "past";

function dayOf(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

/** Jour civil à Paris, pour coller au départ et au retour du dossier. */
export function stayToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Avant le départ, pendant le séjour, ou après le retour. */
export function stayMoment(
  start: string | null | undefined,
  end: string | null | undefined,
  today: string
): StayMoment {
  const startDay = dayOf(start);
  const endDay = dayOf(end);
  const todayDay = dayOf(today) || today;
  if (endDay && todayDay > endDay) return "past";
  if (startDay && todayDay >= startDay) return "travelling";
  return "before";
}

/** Le retour n’est pas passé. Sans date de retour, le séjour reste ouvert. */
export function stayDatesOpen(end: string | null | undefined, today: string) {
  return stayMoment(null, end, today) !== "past";
}

/** Pastille calendrier. Avant le départ, rien. */
export function stayMomentLabel(moment: StayMoment) {
  if (moment === "travelling") return "En voyage";
  if (moment === "past") return "Terminée";
  return null;
}
