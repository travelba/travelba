/** Pause du Concierge jusqu’au lendemain matin, heure de Paris. */

export function threadIsPaused(until: string | null | undefined, now: Date) {
  if (!until) return false;
  const end = new Date(until).getTime();
  return Number.isFinite(end) && end > now.getTime();
}

function parisParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour: pick("hour") };
}

function parisHour(date: Date) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date)
  );
}

function parisDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 8 h le lendemain, à Paris. */
export function nextParisMorning(now: Date) {
  const today = parisParts(now);
  const day = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  let cursor = new Date(Date.UTC(today.year, today.month - 1, today.day + 1, 6, 0, 0));
  for (let step = 0; step < 8; step += 1) {
    if (parisDay(cursor) > day && parisHour(cursor) === 8) return cursor;
    cursor = new Date(cursor.getTime() + (8 - parisHour(cursor)) * 3_600_000);
  }
  return cursor;
}

export function agencySignoff(body: string) {
  const trimmed = body.replace(/\s+$/u, "").trim();
  if (trimmed.endsWith("L’agence")) return trimmed;
  return `${trimmed}\n\nL’agence`;
}
