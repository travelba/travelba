/**
 * Réservation directe auprès de l’hôtel. Machine pure : statuts, effets, idempotence.
 * Aucun secret, aucun numéro de carte. Le client ne voit que le libellé français.
 */

export const CLIENT_PHASE_LABEL = {
  transmitted: "Demande transmise à l’hôtel",
  confirming: "En cours de confirmation",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  refunding: "Remboursement en cours",
} as const;

export type ClientPhase = keyof typeof CLIENT_PHASE_LABEL;

export const CHASE_MS = 24 * 60 * 60 * 1000;
export const ALERT_MS = 48 * 60 * 60 * 1000;
export const AUTH_RENEW_MS = 6 * 24 * 60 * 60 * 1000;
export const AUTH_HOLD_MS = 7 * 24 * 60 * 60 * 1000;

export type DirectStay = {
  phase: ClientPhase;
  payMethod: "card" | "agency";
  stripe: "none" | "authorized" | "captured" | "released" | "refunded" | "expired";
  authorizedAt: string | null;
  pliant: "none" | "issued" | "locked" | "charged" | "refunded";
  mail: "none" | "no_contact" | "sent" | "chased" | "alerted";
  hotelPay: "none" | "link_ready" | "expired" | "paid" | "card_sent" | "refund_requested" | "refunded" | "partial";
  priceState: "quoted" | "awaiting_hotel" | "confirmed" | "changed";
  partnerRate: boolean;
  confirmation: string | null;
  sellCents: number;
  hotelCents: number;
  currency: string;
  freeCancellation: boolean;
  cancelDeadline: string | null;
  conditions: string;
  keys: string[];
  clientRefunded: boolean;
  reason: string;
  mailSentAt: string | null;
  draft: string | null;
  guests: string[];
  arrival: string | null;
  stripeIntent: string | null;
  pliantCardId: string | null;
  reference: string;
  hotelName: string;
};

export type DirectEffect =
  | { type: "mail"; kind: "request" | "chase" | "cancel" | "refund"; key: string }
  | { type: "card"; key: string }
  | { type: "lock_card"; key: string }
  | { type: "debit"; key: string }
  | { type: "void_debit"; key: string }
  | { type: "capture"; key: string }
  | { type: "release"; key: string }
  | { type: "refund_client"; key: string; amountCents: number }
  | { type: "task"; key: string; label: string }
  | { type: "draft"; key: string };

export type AuditLine = { action: string; detail: string };

export type StayStep = { stay: DirectStay; effects: DirectEffect[]; audit: AuditLine[] };

const PAY_URL = /https?:\/\/[^\s<>"']+/gi;

export function redactAudit(text: string) {
  return text
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "••••")
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+\b/g, "[secret]")
    .replace(/bearer\s+\S+/gi, "bearer [secret]")
    .replace(/\b\d{3}\b(?=(\s+\d{3}){2,})/g, "•••")
    .slice(0, 500);
}

export function directCardCeilingCents(hotelCents: number) {
  if (!Number.isInteger(hotelCents) || hotelCents < 1) return null;
  return Math.ceil((hotelCents * 105) / 100);
}

export function paymentLinkFromReply(text: string) {
  const urls = text.match(PAY_URL) || [];
  for (const raw of urls) {
    const url = raw.replace(/[).,]+$/, "");
    if (/pay|payment|checkout|invoice|secure|adyen|stripe|worldpay|pci|reglement|paiement|authoriz/i.test(url)) {
      return url.slice(0, 500);
    }
  }
  return null;
}

export function confirmationFromReply(text: string) {
  const match = text.match(
    /(?:confirmation|confirm[ée]e?|booking\s+(?:ref(?:erence)?|number)|r[ée]f(?:[ée]rence)?(?:\s+de\s+r[ée]servation)?|reservation\s+(?:number|no\.?))\s*[:#n°.\-]?\s*([A-Z0-9][A-Z0-9\-/]{2,24})/i
  );
  const value = match?.[1]?.replace(/[.,;]+$/, "") || "";
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value.slice(0, 40);
}

export type ReplyReading = {
  link: string | null;
  confirmation: string | null;
  refusal: boolean;
  full: boolean;
  priceChanged: boolean;
  refund: boolean;
  partial: boolean;
};

export function readHotelReply(text: string): ReplyReading {
  const body = redactAudit(text);
  const lower = body.toLowerCase();
  return {
    link: paymentLinkFromReply(body),
    confirmation: confirmationFromReply(body),
    refusal: /refus|unable to confirm|ne pouvons|cannot confirm|not available|indisponible/.test(lower),
    full: /complet|sold out|fully booked|plus de chambre/.test(lower),
    priceChanged: /tarif (?:modifi|chang)|price (?:change|has changed)|nouveau tarif|au lieu de/.test(lower),
    refund: /rembours|refund/.test(lower),
    partial: /partiel|partial/.test(lower),
  };
}

function blank(input: {
  payMethod: "card" | "agency";
  sellCents: number;
  currency: string;
  partnerRate: boolean;
  freeCancellation: boolean;
  cancelDeadline: string | null;
  conditions: string;
  guests?: string[];
  arrival?: string | null;
}): DirectStay {
  return {
    phase: "transmitted",
    payMethod: input.payMethod,
    stripe: "none",
    authorizedAt: null,
    pliant: "none",
    mail: "none",
    hotelPay: "none",
    priceState: input.partnerRate ? "awaiting_hotel" : "quoted",
    partnerRate: input.partnerRate,
    confirmation: null,
    sellCents: input.sellCents,
    hotelCents: input.sellCents,
    currency: input.currency,
    freeCancellation: input.freeCancellation,
    cancelDeadline: input.cancelDeadline,
    conditions: input.conditions,
    keys: [],
    clientRefunded: false,
    reason: "",
    mailSentAt: null,
    draft: null,
    guests: input.guests || [],
    arrival: input.arrival || null,
    stripeIntent: null,
    pliantCardId: null,
    reference: "",
    hotelName: "",
  };
}

function withKey(stay: DirectStay, key: string): DirectStay {
  if (stay.keys.includes(key)) return stay;
  return { ...stay, keys: [...stay.keys, key] };
}

function pushEffect(stay: DirectStay, effects: DirectEffect[], effect: DirectEffect) {
  if (stay.keys.includes(effect.key)) return stay;
  effects.push(effect);
  return withKey(stay, effect.key);
}

export function openStay(input: {
  payMethod: "card" | "agency";
  sellCents: number;
  currency: string;
  partnerRate: boolean;
  freeCancellation: boolean;
  cancelDeadline: string | null;
  conditions: string;
  hotelEmail: string | null;
  guests?: string[];
  arrival?: string | null;
  now: string;
}): StayStep {
  let stay = blank(input);
  const effects: DirectEffect[] = [];
  const audit: AuditLine[] = [{ action: "ouverte", detail: input.payMethod === "card" ? "Carte, autorisation" : "Payé par l’agence" }];
  if (input.payMethod === "card") {
    stay = { ...stay, stripe: "authorized", authorizedAt: input.now };
    stay = withKey(stay, "stripe:auth");
  } else {
    stay = pushEffect(stay, effects, { type: "debit", key: "debit:agency" });
  }
  stay = pushEffect(stay, effects, { type: "card", key: "card:issue" });
  if (stay.pliant === "none") stay = { ...stay, pliant: "issued" };
  if (!input.hotelEmail) {
    stay = { ...stay, mail: "no_contact" };
    stay = pushEffect(stay, effects, { type: "task", key: "task:no-email", label: "Adresse hôtel manquante" });
    audit.push({ action: "e-mail", detail: "Aucun envoi : contact réservation absent" });
  } else {
    stay = { ...stay, mail: "sent", mailSentAt: input.now };
    stay = pushEffect(stay, effects, { type: "mail", kind: "request", key: "mail:request" });
    audit.push({ action: "e-mail", detail: "Demande envoyée à l’hôtel" });
  }
  if (input.partnerRate) {
    stay = pushEffect(stay, effects, {
      type: "task",
      key: "task:partner-rate",
      label: "Tarif partenaire : confirmer le prix avant encaissement",
    });
  }
  return { stay, effects, audit };
}

function releaseMoney(stay: DirectStay, effects: DirectEffect[]) {
  let next = stay;
  if (next.stripe === "authorized") {
    next = { ...next, stripe: "released" };
    next = pushEffect(next, effects, { type: "release", key: "stripe:release" });
  }
  if (next.payMethod === "agency") {
    next = pushEffect(next, effects, { type: "void_debit", key: "debit:void" });
  }
  if (next.pliant === "issued") {
    next = { ...next, pliant: "locked" };
    next = pushEffect(next, effects, { type: "lock_card", key: "card:lock" });
  }
  return next;
}

function paidByAgency(stay: DirectStay) {
  return stay.hotelPay === "paid" || stay.hotelPay === "card_sent" || stay.pliant === "charged" || stay.hotelPay === "refund_requested" || stay.hotelPay === "partial";
}

function confirmIfReady(stay: DirectStay, effects: DirectEffect[], now: string) {
  let next = stay;
  if (!next.confirmation) return next;
  if (next.partnerRate && next.priceState !== "confirmed") {
    next = { ...next, phase: "confirming" };
    next = pushEffect(next, effects, {
      type: "task",
      key: "task:await-price",
      label: "Numéro reçu : attendre le prix de l’hôtel avant d’encaisser",
    });
    return next;
  }
  if (next.priceState === "changed") {
    next = { ...next, phase: "confirming" };
    return next;
  }
  next = { ...next, phase: "confirmed", priceState: next.priceState === "awaiting_hotel" ? "confirmed" : next.priceState };
  if (next.payMethod === "card" && next.stripe === "authorized") {
    next = { ...next, stripe: "captured" };
    next = pushEffect(next, effects, { type: "capture", key: "stripe:capture" });
  }
  if (!next.draft) {
    next = { ...next, draft: "ready" };
    next = pushEffect(next, effects, { type: "draft", key: "draft:client" });
  }
  next = pushEffect(next, effects, { type: "task", key: "task:confirmed", label: `Confirmée ${now.slice(0, 10)}` });
  return next;
}

function startRefund(stay: DirectStay, effects: DirectEffect[]) {
  let next: DirectStay = { ...stay, phase: "refunding", hotelPay: "refund_requested" };
  next = pushEffect(next, effects, { type: "mail", kind: "refund", key: "mail:refund" });
  next = pushEffect(next, effects, { type: "task", key: "task:refund", label: "Remboursement demandé à l’hôtel" });
  return next;
}

function refundClient(stay: DirectStay, effects: DirectEffect[], amountCents: number) {
  if (stay.clientRefunded) return stay;
  let next = { ...stay, clientRefunded: true };
  if (next.stripe === "captured") next = { ...next, stripe: "refunded" };
  next = pushEffect(next, effects, { type: "refund_client", key: "client:refund", amountCents });
  return next;
}

export function applyStay(stay: DirectStay, event: StayEvent, now: string): StayStep | { error: string } {
  const effects: DirectEffect[] = [];
  const audit: AuditLine[] = [];
  let next = stay;

  if (event.type === "reply") {
    const reading = readHotelReply(event.text);
    audit.push({ action: "réponse", detail: redactAudit(event.text).slice(0, 180) || "Réponse rattachée" });
    if (reading.refund) {
      if (reading.partial) {
        next = { ...next, phase: "refunding", hotelPay: "partial" };
        next = pushEffect(next, effects, { type: "task", key: "task:partial", label: "Remboursement partiel reçu" });
        audit.push({ action: "remboursement", detail: "Partiel, montant à confirmer" });
        return { stay: next, effects, audit };
      }
      next = { ...next, phase: "refunding", hotelPay: "refunded", pliant: next.pliant === "issued" || next.pliant === "charged" ? "refunded" : next.pliant };
      next = refundClient(next, effects, next.sellCents);
      next = { ...next, phase: "cancelled" };
      audit.push({ action: "remboursement", detail: "Intégral" });
      return { stay: next, effects, audit };
    }
    if (reading.refusal || reading.full) {
      const reason = reading.full ? "L’hôtel est complet." : "L’hôtel n’a pas confirmé.";
      if (paidByAgency(next)) {
        next = { ...next, reason };
        next = startRefund(next, effects);
      } else {
        next = releaseMoney({ ...next, phase: "cancelled", reason }, effects);
      }
      audit.push({ action: "refus", detail: reason });
      return { stay: next, effects, audit };
    }
    if (reading.priceChanged) {
      next = { ...next, phase: "confirming", priceState: "changed" };
      next = pushEffect(next, effects, { type: "task", key: "task:price", label: "Prix modifié par l’hôtel" });
      audit.push({ action: "prix", detail: "Tarif à confirmer" });
    }
    if (reading.link) {
      next = { ...next, phase: "confirming", hotelPay: next.hotelPay === "none" ? "link_ready" : next.hotelPay };
      next = pushEffect(next, effects, { type: "task", key: "task:pay-link", label: "Payer le lien" });
      audit.push({ action: "lien", detail: "Lien de paiement repéré" });
    }
    if (reading.confirmation) {
      next = { ...next, confirmation: reading.confirmation, phase: next.phase === "transmitted" ? "confirming" : next.phase };
      next = confirmIfReady(next, effects, now);
      audit.push({ action: "confirmation", detail: reading.confirmation });
    }
    if (!reading.link && !reading.confirmation && !reading.priceChanged) {
      next = { ...next, phase: next.phase === "transmitted" ? "confirming" : next.phase };
    }
    return { stay: next, effects, audit };
  }

  if (event.type === "mark_paid") {
    if (next.hotelPay === "paid") return { stay: next, effects, audit };
    next = { ...next, hotelPay: "paid", pliant: next.pliant === "issued" ? "charged" : next.pliant, phase: "confirming" };
    audit.push({ action: "paiement", detail: "Lien marqué payé" });
    return { stay: next, effects, audit };
  }

  if (event.type === "mark_link_expired") {
    next = { ...next, hotelPay: "expired", phase: "confirming" };
    next = pushEffect(next, effects, { type: "task", key: "task:link-expired", label: "Lien de paiement expiré" });
    audit.push({ action: "lien", detail: "Expiré" });
    return { stay: next, effects, audit };
  }

  if (event.type === "send_card") {
    next = { ...next, hotelPay: "card_sent", phase: "confirming" };
    next = pushEffect(next, effects, { type: "task", key: "task:card-sent", label: "Accès carte envoyé à l’hôtel" });
    audit.push({ action: "carte", detail: "Accès sécurisé, sans numéro dans le journal" });
    return { stay: next, effects, audit };
  }

  if (event.type === "pliant_charged") {
    next = { ...next, pliant: "charged", hotelPay: next.hotelPay === "none" || next.hotelPay === "card_sent" ? "paid" : next.hotelPay };
    audit.push({ action: "carte", detail: "Dépense rattachée" });
    return { stay: next, effects, audit };
  }

  if (event.type === "price_ok") {
    if (event.hotelCents < 1) return { error: "Prix hôtel invalide." };
    next = { ...next, hotelCents: event.hotelCents, priceState: "confirmed" };
    next = confirmIfReady(next, effects, now);
    audit.push({ action: "prix", detail: "Prix hôtel confirmé" });
    return { stay: next, effects, audit };
  }

  if (event.type === "clock") {
    const sent = next.mailSentAt ? Date.parse(next.mailSentAt) : NaN;
    const nowMs = Date.parse(now);
    if (Number.isFinite(sent) && next.phase === "transmitted") {
      const age = nowMs - sent;
      if (age >= ALERT_MS && next.mail !== "alerted" && next.mail !== "no_contact") {
        next = { ...next, mail: "alerted" };
        next = pushEffect(next, effects, { type: "task", key: "task:silence", label: "Hôtel sans réponse" });
        audit.push({ action: "relance", detail: "Alerte agence" });
      } else if (age >= CHASE_MS && next.mail === "sent") {
        next = { ...next, mail: "chased" };
        next = pushEffect(next, effects, { type: "mail", kind: "chase", key: "mail:chase" });
        audit.push({ action: "relance", detail: "Relance à l’hôtel" });
      }
    }
    if (next.payMethod === "card" && next.stripe === "authorized" && next.authorizedAt && next.phase !== "confirmed" && next.phase !== "cancelled") {
      const age = nowMs - Date.parse(next.authorizedAt);
      if (age >= AUTH_HOLD_MS) {
        next = releaseMoney({ ...next, phase: "cancelled", stripe: "authorized", reason: "Le délai de confirmation est dépassé." }, effects);
        next = { ...next, stripe: "expired" };
        audit.push({ action: "autorisation", detail: "Libérée, délai dépassé" });
      } else if (age >= AUTH_RENEW_MS) {
        next = pushEffect(next, effects, { type: "task", key: "task:reauth", label: "Renouveler l’autorisation" });
      }
    }
    return { stay: next, effects, audit };
  }

  if (event.type === "reauthorize") {
    if (next.stripe !== "authorized" && next.stripe !== "expired") return { error: "Aucune autorisation à renouveler." };
    next = { ...next, stripe: "authorized", authorizedAt: now, phase: next.phase === "cancelled" ? "confirming" : next.phase, reason: "" };
    audit.push({ action: "autorisation", detail: "Renouvelée" });
    return { stay: next, effects, audit };
  }

  if (event.type === "cancel_client" || event.type === "cancel_agency" || event.type === "cancel_hotel") {
    if (next.phase === "cancelled") return { stay: next, effects, audit };
    const who = event.type === "cancel_hotel" ? "Hôtel" : event.type === "cancel_agency" ? "Agence" : "Client";
    if (event.type === "cancel_client") {
      const offer = cancelOffer(next, now.slice(0, 10));
      if (offer.mode !== "cancel") return { error: "Annulation à demander à l’agence." };
    }
    if (paidByAgency(next) || next.hotelPay === "paid") {
      next = { ...next, reason: `${who} · annulation` };
      next = startRefund(next, effects);
    } else {
      next = releaseMoney({ ...next, phase: "cancelled", reason: `${who} · annulation` }, effects);
      if (next.mail === "sent" || next.mail === "chased" || next.mail === "alerted") {
        next = pushEffect(next, effects, { type: "mail", kind: "cancel", key: "mail:cancel" });
      }
    }
    audit.push({ action: "annulation", detail: who });
    return { stay: next, effects, audit };
  }

  if (event.type === "ask_agency") {
    next = pushEffect(next, effects, { type: "task", key: "task:client-ask", label: "Le client demande une annulation" });
    audit.push({ action: "demande", detail: "Annulation demandée à l’agence" });
    return { stay: next, effects, audit };
  }

  if (event.type === "refund_now") {
    if (!paidByAgency(next) && next.phase !== "refunding") return { error: "Rien à rembourser." };
    next = refundClient({ ...next, phase: "refunding" }, effects, next.sellCents);
    audit.push({ action: "remboursement", detail: "Client remboursé tout de suite" });
    return { stay: next, effects, audit };
  }

  return { error: "Action inconnue." };
}

export type StayEvent =
  | { type: "reply"; text: string }
  | { type: "mark_paid" }
  | { type: "mark_link_expired" }
  | { type: "send_card" }
  | { type: "pliant_charged" }
  | { type: "price_ok"; hotelCents: number }
  | { type: "clock" }
  | { type: "reauthorize" }
  | { type: "cancel_client" }
  | { type: "cancel_agency" }
  | { type: "cancel_hotel" }
  | { type: "ask_agency" }
  | { type: "refund_now" };

export function cancelOffer(stay: DirectStay, today: string): { mode: "cancel" | "ask" | "none"; conditions: string } {
  if (stay.phase === "cancelled" || stay.phase === "refunding") return { mode: "none", conditions: stay.conditions };
  const open = stay.phase === "transmitted" || stay.phase === "confirming" || stay.phase === "confirmed";
  if (!open) return { mode: "none", conditions: stay.conditions };
  const before = Boolean(stay.cancelDeadline && today < stay.cancelDeadline);
  if (stay.freeCancellation && before) return { mode: "cancel", conditions: stay.conditions };
  return { mode: "ask", conditions: stay.conditions || "Ce tarif ne prévoit pas d’annulation gratuite." };
}

export const PAY_COPY = {
  cardTitle: "Payer par carte",
  card: "Autorisation maintenant. L’encaissement n’a lieu que si l’hôtel confirme.",
  agencyTitle: "Payé par l’agence",
  agency: "L’agence avance le séjour. Le montant rejoint vos transactions.",
  trial: "Essai : aucun encaissement, aucun e-mail à l’hôtel.",
} as const;

export function clientStayLabel(stay: Pick<DirectStay, "phase" | "confirmation">) {
  const label = CLIENT_PHASE_LABEL[stay.phase];
  if (stay.phase === "confirmed" && stay.confirmation) return `${label} · ${stay.confirmation}`;
  return label;
}

export function idempotencyKeyFor(customerId: string, offerId: string) {
  return `direct:${customerId}:${offerId}`;
}
