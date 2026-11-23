/** Toutes les cases de l’application. Vrai dès que la personne accepte la permission iOS. */
export const PUSH_PREF_FIELDS = [
  "push_travel",
  "push_documents",
  "push_payment",
  "push_messages",
  "push_checkin",
  "push_flight_change",
  "push_departure",
  "push_balance",
] as const;

export type PushPrefField = (typeof PUSH_PREF_FIELDS)[number];

export function pushDefaultsPatch(): Record<PushPrefField, true> {
  return {
    push_travel: true,
    push_documents: true,
    push_payment: true,
    push_messages: true,
    push_checkin: true,
    push_flight_change: true,
    push_departure: true,
    push_balance: true,
  };
}

/**
 * iOS ne montre la demande qu’une fois, tant que le statut est encore « prompt ».
 * Pas d’écran préalable. Accordé ou refusé : on ne redemande pas.
 */
export function shouldRequestIosPush(status: string | null | undefined) {
  return status === "prompt" || status === "prompt-with-rationale";
}

/** Le bandeau n’apparaît qu’après un refus iOS, pas pendant la demande. */
export function shouldShowPushSettingsBanner(status: string | null | undefined, dismissed: boolean) {
  return status === "denied" && !dismissed;
}
