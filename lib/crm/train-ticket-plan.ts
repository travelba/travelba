import { zoneOffsetMinutes } from "./airport-time";
import { isoDay } from "./train-request";
import { trainClock } from "./train-whatsapp";

/**
 * Envoi du PDF le matin du départ.
 * Train à 10h ou après : 8h locale. Train plus tôt : deux heures avant.
 * Fenêtre de 50 minutes, pour un cron au quart d’heure.
 */
export function trainTicketSendWindow(input: { departureLocal: string; timeZone: string; now: number }) {
  const clock = trainClock(input.departureLocal.slice(11, 16));
  const day = isoDay(input.departureLocal);
  if (!clock || !day) return null;
  const hour = Number(clock.slice(0, 2));
  const minute = Number(clock.slice(3));
  const offset = zoneOffsetMinutes(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
    input.timeZone
  );
  if (offset == null) return null;
  const departure =
    Date.parse(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`) - offset * 60_000;
  const target = hour >= 10 ? departure - (hour * 60 + minute - 8 * 60) * 60_000 : departure - 2 * 60 * 60 * 1000;
  const openFor = 50 * 60 * 1000;
  return {
    departure,
    target,
    due: input.now >= target && input.now < target + openFor && input.now < departure,
    raison: hour >= 10 ? "8h locale le jour du départ" : "deux heures avant le train",
  };
}
