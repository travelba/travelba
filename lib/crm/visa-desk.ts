import { addIsoDays } from "./dates";
import type { EurFx, VisaCorridor } from "./visa-fees";

export type { EurFx, VisaCorridor };

export type DeskReason = "refus" | "message";

export type DeskTask = {
  bookingId: string;
  holderName: string;
  reference: string;
  reasons: DeskReason[];
  doneAt: string | null;
  createdAt: string;
};

export function reasonLabel(reasons: DeskReason[]) {
  const parts: string[] = [];
  if (reasons.includes("refus")) parts.push("Refus");
  if (reasons.includes("message")) parts.push("message non parti");
  return parts.join(" · ");
}

function dayStamp(iso: string) {
  return iso.slice(0, 10);
}

export function deskView(tasks: DeskTask[], today: string) {
  const open = tasks
    .filter((task) => !task.doneAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const grey = tasks
    .filter((task) => task.doneAt && addIsoDays(dayStamp(task.doneAt), 7) >= today)
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
  const morningAfter = addIsoDays(endDate, 1);
  return clock.date > morningAfter || (clock.date === morningAfter && clock.hour >= 9);
}

export function retryStillDue(firstFailureOn: string, today: string) {
  return today <= addIsoDays(firstFailureOn, 3);
}
