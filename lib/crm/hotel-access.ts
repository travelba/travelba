/**
 * Accès Hôtels : interrupteur par client, bouton selon le réglage d’agence,
 * écran Platinum pour les autres quand le bouton est ouvert à tous.
 * Le libellé du cercle se change ici.
 */

export const HOTEL_MEMBERSHIP_LABEL = "Platinum";

export const HOTEL_BUTTON_AUTHORIZED = "authorized";
export const HOTEL_BUTTON_EVERYONE = "everyone";

export const HOTEL_BUTTON_VISIBILITIES = [HOTEL_BUTTON_AUTHORIZED, HOTEL_BUTTON_EVERYONE] as const;

export type HotelButtonVisibility = (typeof HOTEL_BUTTON_VISIBILITIES)[number];

export const HOTEL_BUTTON_VISIBILITY_KEY = "hotel_button_visibility";

/** Compte de démonstration, séparé des clients. Mode test forcé. */
export const HOTEL_DEMO_CUSTOMER_ID = "d4e0a000-1111-4111-8111-0000000000de";
export const HOTEL_DEMO_EMAIL = "revue-hotels@travelba.fr";

export const HOTEL_ACCESS_COPY = {
  reserved: `La réservation d’hôtels en autonomie est réservée aux membres ${HOTEL_MEMBERSHIP_LABEL}.`,
  ask: `Demander l’accès ${HOTEL_MEMBERSHIP_LABEL}`,
  sent: "Demande envoyée, votre conseiller revient vers vous.",
  benefits: [
    "Choisir le séjour dans votre espace",
    "Confier la demande à l’agence, auprès de l’hôtel",
    "Suivre la confirmation au même endroit",
    "Annuler lorsque le tarif le permet",
  ],
} as const;

export type HotelAccessCustomer = {
  hotel_booking_enabled?: boolean | null;
  hotel_demo?: boolean | null;
  hotel_direct_live?: boolean | null;
};

export function hotelButtonVisibilityOf(value: unknown): HotelButtonVisibility {
  return value === HOTEL_BUTTON_EVERYONE ? HOTEL_BUTTON_EVERYONE : HOTEL_BUTTON_AUTHORIZED;
}

export function hotelBookingEnabled(customer: HotelAccessCustomer | null | undefined) {
  return customer?.hotel_booking_enabled === true;
}

/** Défaut au déploiement : le bouton n’apparaît que si l’accès est activé. */
export function showHotelButton(input: { enabled: boolean; visibility: HotelButtonVisibility }) {
  if (input.visibility === HOTEL_BUTTON_EVERYONE) return true;
  return input.enabled;
}

/** Écran Platinum : bouton visible, accès fermé. Jamais de recherche. */
export function showPlatinumScreen(input: { enabled: boolean; visibility: HotelButtonVisibility }) {
  return showHotelButton(input) && !input.enabled;
}

/** Quatre onglets égaux, sans trou, quand le bouton est caché. */
export function clientNavHasHotel(showButton: boolean) {
  return showButton;
}

export function hotelDirectLive(customer: HotelAccessCustomer | null | undefined) {
  return hotelBookingEnabled(customer) && customer?.hotel_demo !== true && customer?.hotel_direct_live === true;
}

/** connector : le connecteur MCP, au nom de l’agence (jeton général). */
export type AccessActor = "admin" | "agent" | "client" | "connector";

export function decideHotelAccessToggle(input: {
  actor: AccessActor;
  enabled: boolean;
  demo: boolean;
  live: boolean;
}) {
  if (input.actor !== "admin" && input.actor !== "connector") {
    return { ok: false as const, error: "Réservé aux administrateurs." };
  }
  const live = input.enabled && !input.demo && input.live;
  return { ok: true as const, enabled: input.enabled, live };
}

/** État de l’option Hôtels tel que la fiche client et le connecteur le montrent. */
export type HotelOptionState = {
  active: boolean;
  /** test : la demande arrive au CRM, aucun e-mail à l’hôtel, aucun encaissement. reel : envois réels. */
  mode: "test" | "reel";
  demo: boolean;
  /** L’entrée Hôtels est à l’écran du client (accès activé, ou bouton ouvert à tous). */
  bouton_visible: boolean;
  demande_en_attente: boolean;
};

export function hotelOptionState(input: {
  customer: HotelAccessCustomer | null | undefined;
  visibility: HotelButtonVisibility;
  pending: boolean;
}): HotelOptionState {
  const enabled = hotelBookingEnabled(input.customer);
  return {
    active: enabled,
    mode: hotelDirectLive(input.customer) ? "reel" : "test",
    demo: input.customer?.hotel_demo === true,
    bouton_visible: showHotelButton({ enabled, visibility: input.visibility }),
    demande_en_attente: input.pending,
  };
}

export function decideAccessRequest(input: { enabled: boolean; pending: boolean }) {
  if (input.enabled) return { action: "already" as const };
  if (input.pending) return { action: "existing" as const };
  return { action: "created" as const };
}

export function decideRequestReview(input: {
  actor: AccessActor;
  decision: "accept" | "refuse";
  pending: boolean;
}) {
  if (input.actor !== "admin") return { ok: false as const, error: "Réservé aux administrateurs." };
  if (!input.pending) return { ok: false as const, error: "Aucune demande en cours." };
  if (input.decision === "accept") return { ok: true as const, enabled: true, status: "accepted" as const };
  return { ok: true as const, enabled: false, status: "refused" as const };
}

export function decideButtonVisibility(input: { actor: AccessActor; value: unknown }) {
  if (input.actor !== "admin") return { ok: false as const, error: "Réservé aux administrateurs." };
  if (input.value !== HOTEL_BUTTON_AUTHORIZED && input.value !== HOTEL_BUTTON_EVERYONE) {
    return { ok: false as const, error: "Réglage inconnu." };
  }
  return { ok: true as const, value: input.value };
}
