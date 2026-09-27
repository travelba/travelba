import type { ExtraLeg, ServicePlace } from "@/lib/crm/extras";

export const ROLZO_IFRAME_NEW = "/iframe-page/booking/new-booking";
export const ROLZO_IFRAME_DETAILS = "/iframe-page/booking/details";

const STATUS_FR: Record<string, string> = {
  confirmed: "Confirmée",
  booked: "Confirmée",
  completed: "Terminée",
  cancelled: "Annulée",
  canceled: "Annulée",
  pending: "En cours",
};

export function chauffeurReferenceId(reference: string, leg: ExtraLeg) {
  const side = leg === "departure" ? "aller" : "retour";
  return `${reference.trim()}-${side}`;
}

export function rolzoStatusLabel(status: string | null | undefined) {
  if (!status?.trim()) return null;
  const key = status.trim().toLowerCase();
  return STATUS_FR[key] || status.trim();
}

function pickupDate(iso: string | null | undefined) {
  if (!iso) return null;
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(iso)) return iso;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) return `${iso}:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(iso)) return `${iso}Z`;
  return null;
}

/** Message envoyé à l’iframe. `refrenceId` garde l’orthographe ROLZO. */
export function chauffeurIframeMessage(input: {
  encodedInfo: string;
  reference: string;
  leg: ExtraLeg;
  place: ServicePlace;
  airport: string | null;
  stayLabel: string | null;
  whenIso: string | null;
  bookingId?: string | null;
}) {
  const hide = ["team", "earnings"];
  const message: Record<string, unknown> = {
    encodedInfo: input.encodedInfo,
    hide,
    refrenceId: chauffeurReferenceId(input.reference, input.leg),
  };
  if (input.bookingId) {
    message.bookingId = input.bookingId;
    return message;
  }
  message.serviceType = "airport-transfer";
  const airport = input.airport?.trim() || null;
  const stay = input.place === "hotel" ? input.stayLabel?.trim() || null : "domicile";
  const homebound = input.leg === "arrival" && input.place === "home";
  if (homebound) {
    if (airport) message.pickUpLocation = airport;
    message.dropOffLocation = "domicile";
  } else {
    if (stay) message.pickUpLocation = stay;
    if (airport) message.dropOffLocation = airport;
  }
  const when = pickupDate(input.whenIso);
  if (when) message.pickUpDate = when;
  return message;
}

export function rolzoIframeSrc(webHost: string, bookingId?: string | null) {
  const origin = webHost.replace(/\/$/, "");
  const path = bookingId ? ROLZO_IFRAME_DETAILS : ROLZO_IFRAME_NEW;
  return `${origin}${path}`;
}
