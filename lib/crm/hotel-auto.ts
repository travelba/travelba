/**
 * Réservation hôtel autonome : avis agence, demande de lien, paiement.
 * Aucun numéro de carte n’entre dans un texte, un journal ou une file.
 */

import type { HotelArrivalChannel } from "./types";

export const HOTEL_AUTO_CHARGE_MAX_CENTS = 200_000;
export const HOTEL_AUTO_NOTICE_ATTEMPTS = 5;

export type HotelAutoSettings = {
  payRequest: boolean;
  chargeEnabled: boolean;
  chargeMaxCents: number;
};

export const HOTEL_AUTO_SETTINGS_OFF: HotelAutoSettings = {
  payRequest: false,
  chargeEnabled: false,
  chargeMaxCents: HOTEL_AUTO_CHARGE_MAX_CENTS,
};

export type HotelAutoNoticeKind = "confirmed" | "failed" | "cancelled";

export type HotelAutoNoticeFacts = {
  kind: HotelAutoNoticeKind;
  stayId: string;
  bookingId: string | null;
  reference: string | null;
  client: string;
  hotel: string;
  city: string | null;
  checkIn: string | null;
  checkOut: string | null;
  room: string | null;
  rate: string | null;
  amountCents: number | null;
  currency: string | null;
  payMethod: "card" | "agency" | null;
  supplier: string | null;
  confirmation: string | null;
  cancellable: boolean | null;
  cancelDeadline: string | null;
  cardLast4: string | null;
  reason: string | null;
  origin: string;
};

const PAN_RUN = /(?:\d[ -]?){13,19}/;
const KIND_LABEL: Record<HotelAutoNoticeKind, string> = {
  confirmed: "confirmée",
  failed: "échouée",
  cancelled: "annulée",
};

export function readHotelAutoSettings(row: {
  auto_hotel_pay_request?: boolean | null;
  auto_hotel_charge_enabled?: boolean | null;
  auto_hotel_charge_max_cents?: number | null;
} | null): HotelAutoSettings {
  if (!row) return { ...HOTEL_AUTO_SETTINGS_OFF };
  const max = row.auto_hotel_charge_max_cents;
  return {
    payRequest: row.auto_hotel_pay_request === true,
    chargeEnabled: row.auto_hotel_charge_enabled === true,
    chargeMaxCents:
      typeof max === "number" && Number.isInteger(max) && max >= 100 && max <= 5_000_000
        ? max
        : HOTEL_AUTO_CHARGE_MAX_CENTS,
  };
}

export function hotelAutoSettingsPatch(input: { payRequest: boolean; chargeEnabled: boolean; maxEuros: number }) {
  const euros = input.maxEuros;
  if (!Number.isInteger(euros) || euros < 1 || euros > 20_000) {
    return { ok: false as const, error: "Le plafond est un nombre entier d’euros, entre 1 et 20 000." };
  }
  return {
    ok: true as const,
    row: {
      auto_hotel_pay_request: input.payRequest,
      auto_hotel_charge_enabled: input.chargeEnabled,
      auto_hotel_charge_max_cents: euros * 100,
    },
  };
}

/** API Little Emperors : le canal reste little_emperors. Un envoi e-mail, même depuis ce catalogue, est direct. */
export function autonomousArrivalChannel(input: { placed: "api" | "email"; account: string }): HotelArrivalChannel {
  if (input.placed === "api" && /little/i.test(input.account || "")) return "little_emperors";
  return "direct";
}

export function explicitArrivalChannel(details: Record<string, unknown> | null | undefined): HotelArrivalChannel | null {
  const value = details?.arrival_channel;
  if (value === "direct" || value === "little_emperors" || value === "expedia") return value;
  return null;
}

export function isAutonomousStay(details: { autonomous?: unknown; direct_stay_id?: unknown } | null | undefined) {
  if (!details) return false;
  if (details.autonomous === true) return true;
  return typeof details.direct_stay_id === "string" && details.direct_stay_id.length > 0;
}

export function hotelAutoNoticeKey(kind: HotelAutoNoticeKind, stayId: string) {
  return `hotel-auto:${kind}:${stayId}`;
}

export function cardLast4Only(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length !== 4) return null;
  return digits;
}

function scrubLine(value: string) {
  return value.replace(PAN_RUN, "••••").replace(/\s+/g, " ").trim();
}

function money(cents: number | null, currency: string | null) {
  if (cents == null || !Number.isFinite(cents)) return "montant non lu";
  const major = (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${major} ${(currency || "EUR").toUpperCase()}`;
}

function payLabel(method: HotelAutoNoticeFacts["payMethod"]) {
  if (method === "card") return "Carte du client";
  if (method === "agency") return "Compte agence";
  return "Non précisé";
}

function cancelLabel(facts: HotelAutoNoticeFacts) {
  if (facts.cancellable == null) return "Non précisé";
  if (!facts.cancellable) return "Non annulable";
  return facts.cancelDeadline ? `Annulable jusqu’au ${facts.cancelDeadline.slice(0, 16).replace("T", " ")}` : "Annulable";
}

/** Texte de l’avis. Refuse un numéro de carte complet. Les quatre derniers chiffres seulement. */
export function buildHotelAutoNotice(facts: HotelAutoNoticeFacts): { key: string; subject: string; text: string } | null {
  if (!facts.stayId) return null;
  const last4 = cardLast4Only(facts.cardLast4);
  const raw = [
    facts.client,
    facts.hotel,
    facts.room,
    facts.rate,
    facts.confirmation,
    facts.reason,
    facts.reference,
    facts.supplier,
  ]
    .filter((line): line is string => typeof line === "string")
    .join(" ");
  if (PAN_RUN.test(raw)) return null;
  const reference = (facts.reference || "").trim() || "sans référence";
  const hotel = scrubLine(facts.hotel || "Hôtel");
  const client = scrubLine(facts.client || "Client");
  const when = [facts.checkIn, facts.checkOut].filter(Boolean).join(" → ") || "dates non lues";
  const room = scrubLine(facts.room || "chambre non lue");
  const rate = scrubLine(facts.rate || "tarif non lu");
  const supplier = scrubLine(facts.supplier || "fournisseur non lu");
  const confirmation = scrubLine(facts.confirmation || "sans numéro");
  const reason = facts.reason ? scrubLine(facts.reason) : "";
  const dossier = facts.bookingId ? `${facts.origin.replace(/\/$/, "")}/admin/reservations/${facts.bookingId}` : "dossier pas encore ouvert";
  const subject = `Réservation autonome ${KIND_LABEL[facts.kind]} · ${hotel} · ${reference}`;
  const lines = [
    `Réservation autonome ${KIND_LABEL[facts.kind]}.`,
    `Client : ${client}`,
    `Hôtel : ${hotel}${facts.city ? ` · ${scrubLine(facts.city)}` : ""}`,
    `Dates : ${when}`,
    `Chambre / tarif : ${room} · ${rate}`,
    `Montant : ${money(facts.amountCents, facts.currency)}`,
    `Paiement du client : ${payLabel(facts.payMethod)}`,
    `Fournisseur : ${supplier}`,
    `Confirmation : ${confirmation}`,
    `Annulation : ${cancelLabel(facts)}`,
    `Carte fournisseur : ${last4 ? `•••• ${last4}` : "quatre derniers chiffres non lus"}`,
    `Dossier : ${dossier}`,
  ];
  if (reason && facts.kind !== "confirmed") lines.push(`Motif : ${reason}`);
  const text = lines.join("\n");
  if (PAN_RUN.test(text)) return null;
  return { key: hotelAutoNoticeKey(facts.kind, facts.stayId), subject, text };
}

export function noticeRetry(attempts: number, nowMs: number) {
  if (attempts >= HOTEL_AUTO_NOTICE_ATTEMPTS) return { status: "failed" as const, nextMs: nowMs };
  const wait = Math.min(60, 2 ** attempts) * 60_000;
  return { status: "pending" as const, nextMs: nowMs + wait };
}

export type ChargeStop =
  | "montant"
  | "devise"
  | "plafond"
  | "carte"
  | "3ds"
  | "page"
  | "erreur"
  | "deja";

export function chargeMayStart(input: {
  enabled: boolean;
  amountCents: number | null;
  currency: string | null;
  cardLimitCents: number | null;
  maxCents: number;
  already: boolean;
}): { ok: true } | { ok: false; reason: ChargeStop; note: string } {
  if (input.already) return { ok: false, reason: "deja", note: "Un paiement est déjà engagé pour ce séjour." };
  if (!input.enabled) return { ok: false, reason: "erreur", note: "Le paiement automatique est éteint." };
  const currency = (input.currency || "").toUpperCase();
  if (currency !== "EUR") return { ok: false, reason: "devise", note: "Le séjour n’est pas en euros. Paiement à la main." };
  if (input.amountCents == null || input.amountCents <= 0) {
    return { ok: false, reason: "montant", note: "Montant du séjour illisible. Paiement à la main." };
  }
  if (input.amountCents > input.maxCents) {
    return { ok: false, reason: "plafond", note: "Montant au-dessus du plafond automatique. Validation humaine." };
  }
  if (input.cardLimitCents == null) return { ok: false, reason: "carte", note: "La carte d’arrivée n’est pas prête." };
  if (input.cardLimitCents !== input.amountCents) {
    return { ok: false, reason: "carte", note: "Le plafond de la carte n’est pas le montant du séjour." };
  }
  return { ok: true };
}

export type ChargePageView = {
  url: string;
  text: string;
  amountCents: number | null;
  currency: string | null;
  challenge: boolean;
  hasCardFields: boolean;
  confirmed: boolean;
};

const CHALLENGE = /3d\s*secure|three-d|acs\.|creq|pareq|verified by visa|securecode|authentication required|challenge/i;
const CONFIRMED = /payment\s+(successful|received|confirmed)|paiement\s+(reçu|confirme|confirmé)|thank you for your payment/i;

export function readChargePage(input: { url: string; text: string; amountCents: number | null; currency: string | null; hasCardFields: boolean }): ChargePageView {
  const text = input.text.slice(0, 8000);
  return {
    url: input.url,
    text,
    amountCents: input.amountCents,
    currency: input.currency ? input.currency.toUpperCase() : null,
    challenge: CHALLENGE.test(`${input.url}\n${text}`),
    hasCardFields: input.hasCardFields,
    confirmed: CONFIRMED.test(text),
  };
}

/**
 * La page, le séjour et le plafond doivent être le même montant, en euros.
 * 3DS, page inconnue ou écart : on ne saisit pas la carte.
 */
export function decideHotelCharge(input: {
  page: ChargePageView;
  stayCents: number;
  ceilingCents: number;
}): { pay: true } | { pay: false; reason: ChargeStop; note: string } {
  if (!input.page.url.startsWith("https://")) {
    return { pay: false, reason: "page", note: "La page de paiement n’est pas en https." };
  }
  if (input.page.challenge) return { pay: false, reason: "3ds", note: "La page demande une authentification. Paiement à la main." };
  if (input.page.confirmed) return { pay: false, reason: "deja", note: "La page indique déjà un paiement." };
  if (input.page.currency !== "EUR" || input.page.amountCents == null) {
    return { pay: false, reason: "montant", note: "Le montant en euros n’est pas lu sur la page." };
  }
  if (input.page.amountCents !== input.stayCents || input.page.amountCents !== input.ceilingCents || input.stayCents !== input.ceilingCents) {
    return { pay: false, reason: "montant", note: "Le montant de la page, du séjour et du plafond ne sont pas les mêmes." };
  }
  if (!input.page.hasCardFields) return { pay: false, reason: "page", note: "La page ne présente pas de formulaire de carte." };
  return { pay: true };
}

export type ChargeFill = {
  url(): Promise<string>;
  text(): Promise<string>;
  amount(): Promise<{ cents: number | null; currency: string | null }>;
  hasCardFields(): Promise<boolean>;
  fill(secrets: { pan: string; expiry: string; cvc: string }): Promise<void>;
  submit(): Promise<void>;
  clearSecrets(): Promise<void>;
  screenshot(): Promise<Uint8Array>;
};

export type ChargeSessionResult = {
  status: "submitted" | "needs_agent";
  reason: ChargeStop | null;
  note: string;
  screenshot: Uint8Array | null;
};

/** Saisit la carte seulement si la page est celle du montant attendu. Le résultat ne contient pas la carte. */
async function viewOf(page: ChargeFill, hasCardFields: boolean) {
  const money = await page.amount();
  return readChargePage({
    url: await page.url(),
    text: await page.text(),
    amountCents: money.cents,
    currency: money.currency,
    hasCardFields,
  });
}

export async function runChargeSession(
  page: ChargeFill,
  secrets: { pan: string; expiry: string; cvc: string },
  expect: { stayCents: number; ceilingCents: number }
): Promise<ChargeSessionResult> {
  const first = await viewOf(page, await page.hasCardFields());
  const decision = decideHotelCharge({ page: first, ...expect });
  if (!decision.pay) return { status: "needs_agent", reason: decision.reason, note: decision.note, screenshot: null };
  try {
    await page.fill(secrets);
    await page.submit();
  } catch {
    await page.clearSecrets().catch(() => undefined);
    return { status: "needs_agent", reason: "erreur", note: "La saisie n’a pas abouti.", screenshot: null };
  }
  await page.clearSecrets().catch(() => undefined);
  const after = await viewOf(page, false);
  if (after.challenge) {
    return { status: "needs_agent", reason: "3ds", note: "Une authentification est apparue après l’envoi.", screenshot: null };
  }
  if (!after.confirmed) {
    return { status: "needs_agent", reason: "page", note: "La confirmation n’est pas apparue.", screenshot: null };
  }
  if (PAN_RUN.test(after.text)) {
    return { status: "needs_agent", reason: "page", note: "La confirmation affiche encore un numéro. Preuve non gardée.", screenshot: null };
  }
  const screenshot = await page.screenshot().catch(() => null);
  return { status: "submitted", reason: null, note: "Page de confirmation. Le débit Pliant n’est pas encore rapproché.", screenshot };
}

export function chargeResultHasPan(result: ChargeSessionResult, pan: string) {
  const digits = pan.replace(/\D/g, "");
  const blob = JSON.stringify({ status: result.status, reason: result.reason, note: result.note });
  return Boolean(digits.length >= 13 && blob.includes(digits));
}

export type PliantChargeDebit = {
  cardId: string;
  status: string | null;
  billingCents: number | null;
  billingCurrency: string | null;
};

/** Après pliant-sync : le débit du même montant passe le séjour en payé. Un refus s’arrête. */
export function matchHotelChargeDebit(
  job: { pliantCardId: string; amountCents: number; status: string },
  debits: PliantChargeDebit[]
): "paid" | "declined" | "wait" {
  if (job.status === "paid") return "paid";
  const mine = debits.filter((row) => row.cardId === job.pliantCardId);
  if (mine.some((row) => (row.status || "").toUpperCase() === "DECLINED" && row.billingCents === job.amountCents)) return "declined";
  const settled = mine.some((row) => {
    const status = (row.status || "").toUpperCase();
    return (
      row.billingCents === job.amountCents &&
      (row.billingCurrency || "EUR").toUpperCase() === "EUR" &&
      (status === "PENDING" || status === "CONFIRMED" || status === "BOOKED")
    );
  });
  return settled ? "paid" : "wait";
}

export function claimChargeJob(status: string) {
  return status === "queued";
}

export function chargeWorkerAllowed(flag: string | undefined) {
  return flag === "1";
}

export function chargeBrowserPlan(localPaths: string[]) {
  if (localPaths.length > 0) return { mode: "local" as const };
  return {
    mode: "refuse" as const,
    message: "Le paiement hôtel attend une machine avec Chrome. Il ne tourne pas sur Vercel.",
  };
}

export type AutonomousDeskLine = {
  id: string;
  source: "job" | "notice";
  href: string;
  reference: string;
  client: string;
  hotel: string;
  dates: string;
  payment: string;
  manual: boolean;
};

const JOB_PAYMENT: Record<string, string> = {
  queued: "En file",
  running: "Paiement en cours",
  submitted: "En attente du débit",
  paid: "Payé",
  needs_agent: "À payer à la main",
  stopped: "Arrêté",
  failed: "Échec",
};

export function autonomousPaymentLabel(status: string | null, noticeKind: string | null) {
  if (status && JOB_PAYMENT[status]) return JOB_PAYMENT[status];
  if (noticeKind === "failed") return "Réservation échouée";
  if (noticeKind === "cancelled") return "Annulée";
  if (noticeKind === "confirmed") return "Lien de paiement pas encore reçu";
  return "En cours";
}

export function autonomousDeskLines(input: {
  jobs: {
    id: string;
    bookingId: string | null;
    reference: string | null;
    client: string | null;
    hotel: string | null;
    dates: string | null;
    status: string;
    seen: boolean;
  }[];
  notices: {
    id: string;
    bookingId: string | null;
    reference: string | null;
    client: string | null;
    hotel: string | null;
    dates: string | null;
    kind: string;
    seen: boolean;
  }[];
}): AutonomousDeskLine[] {
  const lines: AutonomousDeskLine[] = [];
  const bookings = new Set<string>();
  for (const job of input.jobs) {
    if (job.seen && job.status === "paid") continue;
    if (job.seen && job.status !== "needs_agent" && job.status !== "stopped" && job.status !== "failed") continue;
    const bookingId = job.bookingId || "";
    if (bookingId) bookings.add(bookingId);
    lines.push({
      id: job.id,
      source: "job",
      href: bookingId ? `/admin/reservations/${bookingId}` : "/admin",
      reference: job.reference || "—",
      client: job.client || "Client",
      hotel: job.hotel || "Hôtel",
      dates: job.dates || "",
      payment: autonomousPaymentLabel(job.status, null),
      manual: job.status === "needs_agent" || job.status === "stopped" || job.status === "failed",
    });
  }
  for (const notice of input.notices) {
    if (notice.seen) continue;
    if (notice.bookingId && bookings.has(notice.bookingId)) continue;
    lines.push({
      id: notice.id,
      source: "notice",
      href: notice.bookingId ? `/admin/reservations/${notice.bookingId}` : "/admin",
      reference: notice.reference || "—",
      client: notice.client || "Client",
      hotel: notice.hotel || "Hôtel",
      dates: notice.dates || "",
      payment: autonomousPaymentLabel(null, notice.kind),
      manual: false,
    });
  }
  return lines;
}

export function hotelAutoJournalSummary(action: string, detail: string) {
  const text = scrubLine(`${action} · ${detail}`).slice(0, 240);
  if (PAN_RUN.test(text)) return "Réservation autonome.";
  return text;
}

/** Destinataire de la demande de lien. Hors mode réel, seulement la boîte d’essai. */
export function hotelPayRequestTarget(input: { live: boolean; hotelEmail: string | null; testInbox: string | null }) {
  const hotel = (input.hotelEmail || "").trim().toLowerCase();
  if (!hotel.includes("@")) return { to: null as string | null, redirected: false, blocked: "contact" as const };
  if (!input.live) {
    const test = (input.testInbox || "").trim().toLowerCase();
    if (!test.includes("@")) return { to: null, redirected: true, blocked: "test_inbox" as const };
    return { to: test, redirected: true, blocked: null };
  }
  return { to: hotel, redirected: false, blocked: null };
}

export function mayDeliverHotelPayRequest(input: { to: string; live: boolean; testInbox: string | null }) {
  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) return false;
  if (input.live) return true;
  const test = (input.testInbox || "").trim().toLowerCase();
  return Boolean(test) && to === test;
}
