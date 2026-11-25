/** Carte « Prochain vol » : phase et compte à rebours, sans appel réseau. */

export type LiveClock = {
  /** Heure prévue, HH:MM. Vide si inconnue. */
  scheduled: string;
  /** Heure estimée ou réelle, seulement si elle diffère de la prévue. */
  revised: string;
};

export type LiveFlight = {
  airline: string;
  number: string;
  origin: string;
  destination: string;
  departure: LiveClock;
  arrival: LiveClock;
  /** Instant du décollage retenu (estimé, sinon prévu). Null si le fuseau manque. */
  departureAt: number | null;
  /** Instant de l’arrivée retenue. Null si le fuseau manque. */
  arrivalAt: number | null;
  status: string;
  /** Avant le décollage : « Terminal 2F · Porte K35 ». */
  place: string;
  /** Après le décollage : « Arrivée Terminal 1 », tapis bagages si connu. */
  arrivalPlace: string;
  /** HH:MM de l’arrivée prévue, ou vide. */
  arrivalPrevue: string;
  /** HH:MM réelle d’atterrissage. Vide si AeroAPI ne l’a pas donnée. */
  landedClock: string;
};

export type LivePhase = "before" | "airborne" | "landed" | "cancelled" | "diverted";

export type CountdownUnit = "j" | "h" | "min" | "s";

export type CountdownPart = {
  value: number;
  unit: CountdownUnit;
};

export type LiveCaption =
  | { kind: "countdown"; parts: CountdownPart[] }
  | { kind: "airborne"; parts: CountdownPart[] | null }
  | { kind: "landed"; clock: string }
  | { kind: "plain"; text: string };

const UNIT_WORDS: Record<CountdownUnit, [string, string]> = {
  j: ["jour", "jours"],
  h: ["heure", "heures"],
  min: ["minute", "minutes"],
  s: ["seconde", "secondes"],
};

/** Au-delà de 24 h : jours, heures, minutes. En dessous : heures, minutes, secondes. */
export function countdownParts(ms: number): CountdownPart[] {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (total >= 86400) {
    return [
      { value: days, unit: "j" },
      { value: hours, unit: "h" },
      { value: minutes, unit: "min" },
    ];
  }
  return [
    { value: hours, unit: "h" },
    { value: minutes, unit: "min" },
    { value: seconds, unit: "s" },
  ];
}

/** Phrase lue : les unités à zéro tombent, « 1 jour » reste au singulier. */
export function countdownSpeech(parts: CountdownPart[]) {
  const spoken = parts.filter((part) => part.value > 0);
  const used = spoken.length ? spoken : parts.slice(-1);
  const words = used.map((part) => {
    const [one, many] = UNIT_WORDS[part.unit];
    return `${part.value} ${part.value === 1 ? one : many}`;
  });
  if (words.length <= 1) return words[0] || "";
  return `${words.slice(0, -1).join(", ")} et ${words[words.length - 1]}`;
}

/** Terminal de départ avant l’envol, terminal d’arrivée ensuite. */
export function liveFlightPlace(flight: LiveFlight, nowMs: number) {
  const phase = liveFlightPhase(flight, nowMs);
  if (phase === "airborne" || phase === "landed") return flight.arrivalPlace;
  return flight.place;
}

export function liveFlightPhase(flight: LiveFlight, nowMs: number): LivePhase {
  if (flight.status === "cancelled") return "cancelled";
  if (flight.status === "diverted") return "diverted";
  if (flight.status === "landed") return "landed";
  if (flight.status === "en_route") return "airborne";
  if (flight.arrivalAt != null && nowMs >= flight.arrivalAt) return "landed";
  if (flight.departureAt != null && nowMs >= flight.departureAt) return "airborne";
  return "before";
}

/** 0 avant le départ, 1 à l’atterrissage, part du trajet une fois en vol. */
export function liveFlightProgress(flight: LiveFlight, nowMs: number): number {
  const phase = liveFlightPhase(flight, nowMs);
  if (phase === "landed") return 1;
  if (phase === "before" || phase === "cancelled") return 0;
  return airborneShare(flight, nowMs);
}

function airborneShare(flight: LiveFlight, nowMs: number) {
  const start = flight.departureAt;
  const end = flight.arrivalAt;
  if (start == null || end == null || end <= start) return 0.5;
  const ratio = (nowMs - start) / (end - start);
  if (ratio <= 0) return 0.06;
  if (ratio >= 1) return 0.97;
  return ratio;
}

export function liveFlightCaption(flight: LiveFlight, nowMs: number): LiveCaption {
  const phase = liveFlightPhase(flight, nowMs);
  if (phase === "cancelled") return { kind: "plain", text: "Vol annulé" };
  if (phase === "diverted") return { kind: "plain", text: "Vol dérouté" };
  if (phase === "landed") return { kind: "landed", clock: flight.landedClock };
  if (phase === "airborne") {
    const parts =
      flight.arrivalAt != null && flight.arrivalAt > nowMs ? countdownParts(flight.arrivalAt - nowMs) : null;
    return { kind: "airborne", parts };
  }
  if (flight.departureAt != null && flight.departureAt > nowMs) {
    return { kind: "countdown", parts: countdownParts(flight.departureAt - nowMs) };
  }
  const clock = flight.departure.revised || flight.departure.scheduled;
  return clock ? { kind: "plain", text: `Décollage à ${clock}` } : { kind: "plain", text: "" };
}
