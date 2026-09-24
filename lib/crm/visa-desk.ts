export type VisaCorridor = "IL" | "US" | "GB";

export type DeskReason = "refus" | "message";

export type DeskTask = {
  bookingId: string;
  holderName: string;
  reference: string;
  reasons: DeskReason[];
  doneAt: string | null;
  createdAt: string;
};

/** Plafond par voyageur. ESTA et Royaume-Uni ne sont pas figés tant que le tarif publié n’est pas branché. */
const CEILING_EUR: Partial<Record<VisaCorridor, number>> = { IL: 10 };

export function corridorCeilingEur(country: VisaCorridor, travelers: number) {
  const unit = CEILING_EUR[country];
  if (!unit) return null;
  const count = Math.max(1, Math.floor(travelers) || 1);
  return unit * count;
}

export function combinedCeilingEur(countries: VisaCorridor[], travelers: number) {
  let total = 0;
  for (const country of countries) {
    const part = corridorCeilingEur(country, travelers);
    if (part == null) return null;
    total += part;
  }
  return total;
}

export function agencyFeeVisible(stateFeePaid: boolean) {
  return stateFeePaid;
}

export function canStartCorridor(existing: VisaCorridor[], country: VisaCorridor) {
  return !existing.includes(country);
}

export function pieceReadyCopy(countryName: string, holderName: string) {
  return `${countryName}, ${holderName}. La pièce est dans Pièces.`;
}

export function refusalCopy(countryName: string, holderName: string) {
  return `${countryName}, ${holderName}. La demande n’est pas acceptée. L’agence vous contacte.`;
}

export function clientNoticeAllowed(input: { templateApproved: boolean; phone: string | null }) {
  return Boolean(input.templateApproved && input.phone?.trim());
}

export function reasonLabel(reasons: DeskReason[]) {
  const parts: string[] = [];
  if (reasons.includes("refus")) parts.push("Refus");
  if (reasons.includes("message")) parts.push("message non parti");
  return parts.join(" · ");
}

export function mergeReasons(current: DeskReason[], next: DeskReason) {
  return current.includes(next) ? current : [...current, next];
}

function dayStamp(iso: string) {
  return iso.slice(0, 10);
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function deskView(tasks: DeskTask[], today: string) {
  const open = tasks
    .filter((task) => !task.doneAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const grey = tasks
    .filter((task) => task.doneAt && addDays(dayStamp(task.doneAt), 7) >= today)
    .sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
  return {
    open,
    grey,
    empty: open.length === 0,
  };
}

export function parisClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function shouldCloseCard(endDate: string, now: Date) {
  const clock = parisClock(now);
  const morningAfter = addDays(endDate, 1);
  return clock.date > morningAfter || (clock.date === morningAfter && clock.hour >= 9);
}

export function retryStillDue(firstFailureOn: string, today: string) {
  return today <= addDays(firstFailureOn, 3);
}
