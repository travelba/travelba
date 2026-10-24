/**
 * Aperçu de refonte : modèle pur, lecture seule.
 * Les noms sortent en prénom + initiale. Ni numéro, ni coût net, ni commission réelle.
 */

import { addIsoDays } from "./dates";

export const REFONTE_PREFIX = "/admin/preview/refonte";

/** Fermé en production. `REFONTE_PREVIEW=0` le coupe aussi en local et en preview. */
export function refontePreviewEnabled(env?: { VERCEL_ENV?: string; REFONTE_PREVIEW?: string }) {
  const source = env ?? process.env;
  if (source.VERCEL_ENV === "production") return false;
  if (source.REFONTE_PREVIEW === "0") return false;
  return true;
}

/** Sept groupes du menu actuel, repliés en six entrées. Outils et Équipe deviennent Agence. */
export const REFONTE_MENU = [
  { href: REFONTE_PREFIX, label: "Aujourd’hui", icon: "dashboard", group: "Activité", exact: true },
  { href: `${REFONTE_PREFIX}/dossiers`, label: "Dossiers", icon: "luggage", group: "Dossiers", exact: false },
  { href: `${REFONTE_PREFIX}/clients`, label: "Clients", icon: "group", group: "Clients", exact: false },
  { href: `${REFONTE_PREFIX}/messages`, label: "Messages", icon: "forum", group: "Boîtes de réception", exact: false },
  { href: `${REFONTE_PREFIX}/argent`, label: "Argent", icon: "landmark", group: "Argent", exact: false },
  { href: `${REFONTE_PREFIX}/agence`, label: "Agence", icon: "user_cog", group: "Outils et Équipe", exact: false },
] as const;

export type RefonteMenuHref = (typeof REFONTE_MENU)[number]["href"];

export function refonteActiveHref(pathname: string): RefonteMenuHref | null {
  const matches = REFONTE_MENU.filter((item) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.href ?? null;
}

export function maskPersonName(first: string | null | undefined, last: string | null | undefined) {
  const given = tidyName(first);
  const family = (last || "").trim();
  const initial = [...family].find((char) => /\p{L}/u.test(char));
  if (!given && !initial) return "Client";
  if (!initial) return given;
  if (!given) return `${initial.toLocaleUpperCase("fr-FR")}.`;
  return `${given} ${initial.toLocaleUpperCase("fr-FR")}.`;
}

function tidyName(value: string | null | undefined) {
  const text = (value || "").trim();
  if (!text) return "";
  return text.charAt(0).toLocaleUpperCase("fr-FR") + text.slice(1);
}

function escapeReg(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Retire e-mails, téléphones, suites de chiffres et noms complets. Les dates calendaires restent. */
export function redactSensitive(
  input: string | null | undefined,
  names: { full?: string[]; last?: string[] } = {}
) {
  let text = String(input || "");
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "••••@••••");
  text = text.replace(/(?:\d[\s-]?){12,}/g, "••••");
  text = text.replace(/\+\d[\d\s().-]{7,}\d/g, "••••");
  text = text.replace(/\b0\d(?:[\s.-]?\d){8,}\b/g, "••••");
  text = text.replace(/[A-Z0-9<]{28,}/g, "••••");
  const full = [...(names.full || [])]
    .map((name) => name.trim())
    .filter((name) => name.length >= 5)
    .sort((a, b) => b.length - a.length);
  for (const name of full) {
    const [given, ...rest] = name.split(/\s+/);
    const masked = maskPersonName(given, rest.join(" "));
    text = text.replace(new RegExp(escapeReg(name), "gi"), masked);
  }
  const last = [...(names.last || [])]
    .map((name) => name.trim())
    .filter((name) => name.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const name of last) {
    const initial = `${[...name].find((char) => /\p{L}/u.test(char))?.toLocaleUpperCase("fr-FR") || "•"}.`;
    text = text.replace(new RegExp(`\\b${escapeReg(name)}\\b`, "gi"), initial);
  }
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export const MARGIN_FLOOR = 0.12;

export const OPEN_PAYMENT_STATUSES = ["pending", "link_requested", "link_received", "paying", "blocked"] as const;

export function arrivalNeedsPayment(status: string | null | undefined) {
  return (OPEN_PAYMENT_STATUSES as readonly string[]).includes(status || "");
}

export function paymentTaskTitle(status: string) {
  if (status === "link_received" || status === "link_requested" || status === "paying") return "Lien hôtel à payer";
  return "Paiement fournisseur";
}

const FORMALITY_OK = new Set(["approuve", "non_concerne"]);

export function formalityValidated(status: string | null | undefined) {
  return FORMALITY_OK.has(status || "");
}

export type RefonteColumnId = "preparation" | "visible" | "voyage" | "terminee" | "archivee";

export const REFONTE_COLUMNS: { id: RefonteColumnId; label: string }[] = [
  { id: "preparation", label: "En préparation" },
  { id: "visible", label: "Visible" },
  { id: "voyage", label: "En voyage" },
  { id: "terminee", label: "Terminée" },
  { id: "archivee", label: "Archivée" },
];

export type RefonteBookingInput = {
  id: string;
  reference: string;
  title: string;
  destination: string;
  customerId: string;
  customer: string;
  start: string | null;
  end: string | null;
  visible: boolean;
  archived: boolean;
  sale: number;
  currency: string;
  updatedAt: string;
  cardCount: number;
};

export type RefonteTravelerInput = {
  id: string;
  bookingId: string;
  label: string;
  hasPassport: boolean;
};

export type RefonteItemInput = {
  id: string;
  bookingId: string;
  kind: string;
  title: string;
  start: string | null;
  end: string | null;
  confirmed: boolean;
  active: boolean;
};

export type RefonteCheckInput = {
  id: string;
  bookingId: string;
  travelerId: string;
  program: "ESTA" | "ETA";
  status: string;
};

export type RefonteVisaInput = { bookingId: string; reason: string };

export type RefonteArrivalInput = {
  id: string;
  bookingId: string;
  itemTitle: string;
  status: string;
};

export type RefonteEmailInput = {
  id: string;
  at: string | null;
  label: string;
  preview: string;
  bookingId: string | null;
  waiting: boolean;
};

export type RefonteMailInput = {
  id: string;
  at: string | null;
  bookingId: string;
  preview: string;
  waiting: boolean;
};

export type RefonteWhatsappInput = {
  id: string;
  at: string;
  customerId: string;
  bookingId: string | null;
  direction: "inbound" | "outbound";
  preview: string;
};

export type RefonteConciergeInput = {
  id: string;
  at: string;
  customerId: string;
  bookingId: string | null;
  label: string;
};

export type RefonteCostInput = { bookingId: string; amount: number };

export type RefonteTaskKind =
  | "depart_document"
  | "formalite"
  | "email"
  | "concierge"
  | "paiement"
  | "hotel_confirmation";

export type RefonteTask = {
  id: string;
  kind: RefonteTaskKind;
  bookingId: string | null;
  title: string;
  detail: string;
  action: string;
  href: string;
  at: string | null;
  urgency: number;
};

export type WeekDot = "green" | "orange" | "red";

export type WeekEvent = {
  id: string;
  kind: "depart" | "sur_place" | "retour";
  label: string;
  dot: WeekDot;
  href: string;
};

export type WeekDay = { day: string; events: WeekEvent[] };

export type KanbanCard = {
  id: string;
  href: string;
  customer: string;
  place: string;
  reference: string;
  when: string;
  dot: WeekDot;
};

export type StuckCard = KanbanCard & { since: string };

export type MessageChannel = "whatsapp" | "mail" | "import";

export type MessageRow = {
  id: string;
  channel: MessageChannel;
  title: string;
  preview: string;
  at: string | null;
  href: string;
  waiting: boolean;
};

export type ClientRow = {
  id: string;
  label: string;
  dossiers: number;
  next: string | null;
  href: string;
};

export type SearchHit = {
  id: string;
  href: string;
  label: string;
  hint: string;
  kind: "client" | "dossier" | "message";
};

export type TimelineEvent = {
  id: string;
  at: string | null;
  title: string;
  detail: string;
  channel: "etape" | MessageChannel | "concierge";
};

export type LifecycleStepId = "preparation" | "fournisseurs" | "formalites" | "visible" | "voyage" | "terminee";

export const LIFECYCLE_STEPS: { id: LifecycleStepId; label: string }[] = [
  { id: "preparation", label: "En préparation" },
  { id: "fournisseurs", label: "Fournisseurs payés" },
  { id: "formalites", label: "Formalités OK" },
  { id: "visible", label: "Visible dans l’espace" },
  { id: "voyage", label: "En voyage" },
  { id: "terminee", label: "Terminée" },
];

export type DossierFinance = {
  sale: number;
  currency: string;
  balance: number | null;
  /** Coût fictif, présent seulement si une sortie réelle existe. Jamais le net. */
  cost: number | null;
  margin: number | null;
  under: boolean | null;
};

export type DossierView = {
  id: string;
  href: string;
  reference: string;
  place: string;
  customerId: string;
  customer: string;
  when: string;
  column: RefonteColumnId;
  columnLabel: string;
  archived: boolean;
  visible: boolean;
  travelers: { id: string; label: string; hasPassport: boolean }[];
  items: { id: string; kind: string; title: string; when: string; confirmed: boolean }[];
  tasks: RefonteTask[];
  timeline: TimelineEvent[];
  messages: MessageRow[];
  lastMessage: string | null;
  finance: DossierFinance;
  cardCount: number;
  steps: { id: LifecycleStepId; label: string; state: "done" | "current" | "upcoming" }[];
  primary: string;
};

export type FictiveMonth = {
  dossiers: number;
  sale: number;
  cost: number | null;
  margin: number | null;
  under: boolean | null;
  fictive: true;
};

export type RefonteModel = {
  today: string;
  tasks: RefonteTask[];
  week: WeekDay[];
  money: FictiveMonth;
  stuck: StuckCard[];
  columns: { id: RefonteColumnId; label: string; total: number; cards: KanbanCard[] }[];
  messages: MessageRow[];
  clients: ClientRow[];
  search: SearchHit[];
  counts: { tasks: number; messages: number };
  dossiers: DossierView[];
  costsKnown: boolean;
};

export type RefonteBuildInput = {
  bookings: RefonteBookingInput[];
  travelers: RefonteTravelerInput[];
  items: RefonteItemInput[];
  checks: RefonteCheckInput[];
  visas: RefonteVisaInput[];
  arrivals: RefonteArrivalInput[];
  emails: RefonteEmailInput[];
  mails: RefonteMailInput[];
  whatsapp: RefonteWhatsappInput[];
  concierge: RefonteConciergeInput[];
  costs: RefonteCostInput[] | null;
  balances: { customerId: string; balance: number }[];
};

const TASK_RANK: Record<RefonteTaskKind, number> = {
  depart_document: 0,
  formalite: 1,
  paiement: 2,
  hotel_confirmation: 3,
  concierge: 4,
  email: 5,
};

const TASK_ACTION: Record<RefonteTaskKind, string> = {
  depart_document: "Demander la pièce",
  formalite: "Valider",
  paiement: "Payer",
  hotel_confirmation: "Relancer l’hôtel",
  concierge: "Répondre",
  email: "Relire",
};

function day(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

export function refonteColumn(booking: Pick<RefonteBookingInput, "archived" | "visible" | "start" | "end">, today: string): RefonteColumnId {
  if (booking.archived) return "archivee";
  const start = day(booking.start);
  const end = day(booking.end);
  if (end && end < today) return "terminee";
  if (start && start <= today && (!end || end >= today)) return "voyage";
  if (booking.visible) return "visible";
  return "preparation";
}

function columnLabel(id: RefonteColumnId) {
  return REFONTE_COLUMNS.find((column) => column.id === id)?.label || id;
}

export function dossierHref(id: string) {
  return `${REFONTE_PREFIX}/dossiers/${id}`;
}

function placeOf(booking: Pick<RefonteBookingInput, "destination" | "title">) {
  return (booking.destination || booking.title || "Séjour").trim() || "Séjour";
}

function whenLabel(start: string | null, end: string | null) {
  const from = day(start);
  const to = day(end);
  if (from && to && from !== to) return `${from} → ${to}`;
  return from || to || "Dates à préciser";
}

function hoursUntil(start: string | null, today: string) {
  const from = day(start);
  if (!from) return 9999;
  const [ys, ms, ds] = today.split("-").map(Number);
  const [ye, me, de] = from.split("-").map(Number);
  const diff = Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / 86400000);
  return diff * 24;
}

function within72h(start: string | null, today: string) {
  const from = day(start);
  if (!from) return false;
  return from >= today && from <= addIsoDays(today, 2);
}

function tripOpen(booking: RefonteBookingInput, today: string) {
  if (booking.archived) return false;
  const end = day(booking.end);
  return !end || end >= today;
}

export function fictiveAmounts(sale: number, under: boolean | null) {
  const base = Math.max(2400, Math.round((sale > 0 ? sale : 2400) / 1000) * 1000);
  if (under == null) return { sale: base, cost: null as number | null, margin: null as number | null };
  const rate = under ? 0.09 : 0.18;
  const cost = Math.round(base * (1 - rate));
  return { sale: base, cost, margin: base - cost };
}

function monthBounds(today: string) {
  const start = `${today.slice(0, 7)}-01`;
  const [year, month] = start.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function overlapsMonth(booking: RefonteBookingInput, bounds: { start: string; end: string }) {
  const start = day(booking.start);
  if (!start) return false;
  const end = day(booking.end) || start;
  return start <= bounds.end && end >= bounds.start;
}

export function buildFictiveMonth(
  bookings: RefonteBookingInput[],
  costs: Map<string, number> | null,
  today: string
): FictiveMonth {
  const bounds = monthBounds(today);
  const inMonth = bookings.filter((booking) => !booking.archived && overlapsMonth(booking, bounds));
  if (!costs) {
    const shown = fictiveAmounts(inMonth.reduce((sum, booking) => sum + Math.max(0, booking.sale), 0), null);
    return { dossiers: inMonth.length, ...shown, under: null, fictive: true };
  }
  const rated = inMonth.filter((booking) => booking.sale > 0 && costs.has(booking.id));
  if (!rated.length) {
    const shown = fictiveAmounts(0, null);
    return { dossiers: inMonth.length, ...shown, under: null, fictive: true };
  }
  const sale = rated.reduce((sum, booking) => sum + booking.sale, 0);
  const cost = rated.reduce((sum, booking) => sum + (costs.get(booking.id) || 0), 0);
  const under = (sale - cost) / sale < MARGIN_FLOOR;
  return { dossiers: inMonth.length, ...fictiveAmounts(sale, under), under, fictive: true };
}

export function dossierFinance(
  booking: RefonteBookingInput,
  cost: number | null,
  balance: number | null
): DossierFinance {
  if (cost == null || !(booking.sale > 0)) {
    return { sale: booking.sale, currency: booking.currency || "EUR", balance, cost: null, margin: null, under: null };
  }
  const under = (booking.sale - cost) / booking.sale < MARGIN_FLOOR;
  const shown = fictiveAmounts(booking.sale, under);
  return {
    sale: booking.sale,
    currency: booking.currency || "EUR",
    balance,
    cost: shown.cost,
    margin: shown.margin,
    under,
  };
}

function dotFor(booking: RefonteBookingInput, tasks: RefonteTask[], today: string): WeekDot {
  const mine = tasks.filter((task) => task.bookingId === booking.id);
  if (mine.some((task) => task.kind === "depart_document" || task.kind === "paiement" || task.kind === "formalite")) {
    return "red";
  }
  if (mine.some((task) => task.kind === "hotel_confirmation" || task.kind === "concierge")) return "orange";
  const start = day(booking.start);
  if (!booking.visible && start && start >= today && start <= addIsoDays(today, 7)) return "orange";
  return "green";
}

function task(
  partial: Omit<RefonteTask, "action" | "urgency" | "href"> & { href?: string; hours?: number }
): RefonteTask {
  const hours = partial.hours ?? 9999;
  return {
    id: partial.id,
    kind: partial.kind,
    bookingId: partial.bookingId,
    title: partial.title,
    detail: partial.detail,
    at: partial.at,
    action: TASK_ACTION[partial.kind],
    href: partial.href || (partial.bookingId ? dossierHref(partial.bookingId) : `${REFONTE_PREFIX}/messages`),
    urgency: TASK_RANK[partial.kind] * 100000 + Math.max(0, hours),
  };
}

export function buildRefonteModel(input: RefonteBuildInput, today: string): RefonteModel {
  const bookings = input.bookings.filter((booking) => booking.id);
  const byId = new Map(bookings.map((booking) => [booking.id, booking]));
  const travelersByBooking = group(input.travelers, (row) => row.bookingId);
  const itemsByBooking = group(input.items, (row) => row.bookingId);
  const costMap = input.costs ? new Map(input.costs.map((row) => [row.bookingId, row.amount])) : null;
  const balanceMap = new Map(input.balances.map((row) => [row.customerId, row.balance]));

  const tasks: RefonteTask[] = [];

  for (const booking of bookings) {
    if (!tripOpen(booking, today)) continue;
    const who = booking.customer;
    const place = placeOf(booking);
    if (within72h(booking.start, today)) {
      const missing = (travelersByBooking.get(booking.id) || []).filter((traveler) => !traveler.hasPassport);
      for (const traveler of missing) {
        tasks.push(
          task({
            id: `doc-${traveler.id}`,
            kind: "depart_document",
            bookingId: booking.id,
            title: "Pièce manquante avant le départ",
            detail: `${traveler.label} · ${place} · ${who}`,
            at: day(booking.start) || null,
            hours: hoursUntil(booking.start, today),
          })
        );
      }
    }
    for (const item of itemsByBooking.get(booking.id) || []) {
      if (item.kind !== "hotel" || !item.active || item.confirmed) continue;
      const end = day(item.end) || day(booking.end);
      if (end && end < today) continue;
      tasks.push(
        task({
          id: `hotel-${item.id}`,
          kind: "hotel_confirmation",
          bookingId: booking.id,
          title: "Confirmation d’hôtel manquante",
          detail: `${item.title || "Hôtel"} · ${who}`,
          at: day(item.start) || day(booking.start) || null,
          hours: hoursUntil(item.start || booking.start, today),
        })
      );
    }
  }

  for (const check of input.checks) {
    if (formalityValidated(check.status)) continue;
    const booking = byId.get(check.bookingId);
    if (!booking || !tripOpen(booking, today)) continue;
    const traveler = (travelersByBooking.get(check.bookingId) || []).find((row) => row.id === check.travelerId);
    tasks.push(
      task({
        id: `check-${check.id}`,
        kind: "formalite",
        bookingId: check.bookingId,
        title: `${check.program} non validée`,
        detail: `${traveler?.label || booking.customer} · ${placeOf(booking)}`,
        at: day(booking.start) || null,
        hours: hoursUntil(booking.start, today),
      })
    );
  }

  for (const visa of input.visas) {
    const booking = byId.get(visa.bookingId);
    if (!booking || !tripOpen(booking, today)) continue;
    tasks.push(
      task({
        id: `visa-${visa.bookingId}`,
        kind: "formalite",
        bookingId: visa.bookingId,
        title: "ESTA / ETA non validée",
        detail: `${visa.reason || "Formalité ouverte"} · ${booking.customer}`,
        at: day(booking.start) || null,
        hours: hoursUntil(booking.start, today),
      })
    );
  }

  for (const arrival of input.arrivals) {
    if (!arrivalNeedsPayment(arrival.status)) continue;
    const booking = byId.get(arrival.bookingId);
    if (!booking || !tripOpen(booking, today)) continue;
    tasks.push(
      task({
        id: `pay-${arrival.id}`,
        kind: "paiement",
        bookingId: arrival.bookingId,
        title: paymentTaskTitle(arrival.status),
        detail: `${arrival.itemTitle || "Hôtel"} · ${booking.customer}`,
        at: day(booking.start) || null,
        hours: hoursUntil(booking.start, today),
      })
    );
  }

  for (const row of input.concierge) {
    const booking = row.bookingId ? byId.get(row.bookingId) : undefined;
    tasks.push(
      task({
        id: `concierge-${row.id}`,
        kind: "concierge",
        bookingId: row.bookingId,
        title: "Demande du concierge",
        detail: `${row.label} · ${booking?.customer || "Client"}`,
        at: row.at,
        hours: 48,
      })
    );
  }

  for (const email of input.emails) {
    if (!email.waiting) continue;
    tasks.push(
      task({
        id: `mail-${email.id}`,
        kind: "email",
        bookingId: email.bookingId,
        title: "Mail dans la boîte d’import",
        detail: [email.label, email.preview].filter(Boolean).join(" · ") || "À relire",
        at: email.at,
        hours: 72,
        href: email.bookingId ? dossierHref(email.bookingId) : `${REFONTE_PREFIX}/messages?canal=import`,
      })
    );
  }

  tasks.sort((a, b) => a.urgency - b.urgency || a.title.localeCompare(b.title, "fr"));

  const week = buildWeek(bookings, tasks, today);
  const columns = buildColumns(bookings, tasks, today);
  const stuck = buildStuck(bookings, tasks, today);
  const messages = buildMessages(input, byId);
  const clients = buildClients(bookings, today);
  const search = buildSearch(clients, bookings, messages);
  const dossiers = bookings.map((booking) =>
    buildDossier(booking, {
      today,
      travelers: travelersByBooking.get(booking.id) || [],
      items: itemsByBooking.get(booking.id) || [],
      tasks: tasks.filter((row) => row.bookingId === booking.id),
      messages: messages.filter(
        (row) => row.href === dossierHref(booking.id) || (row.href.startsWith(dossierHref(booking.id)) && row.channel !== "import")
      ),
      timeline: buildTimeline(booking, itemsByBooking.get(booking.id) || [], input),
      cost: costMap ? costMap.get(booking.id) ?? null : null,
      balance: balanceMap.has(booking.customerId) ? balanceMap.get(booking.customerId)! : null,
      openPayment: input.arrivals.some((row) => row.bookingId === booking.id && arrivalNeedsPayment(row.status)),
      openFormality: tasks.some((row) => row.bookingId === booking.id && row.kind === "formalite"),
    })
  );

  const waitingMessages = messages.filter((row) => row.waiting).length;
  return {
    today,
    tasks: tasks.slice(0, 14),
    week,
    money: buildFictiveMonth(bookings, costMap, today),
    stuck,
    columns,
    messages,
    clients,
    search,
    counts: { tasks: tasks.length, messages: waitingMessages },
    dossiers,
    costsKnown: costMap != null,
  };
}

function group<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = map.get(id);
    if (list) list.push(row);
    else map.set(id, [row]);
  }
  return map;
}

function buildWeek(bookings: RefonteBookingInput[], tasks: RefonteTask[], today: string): WeekDay[] {
  const days = Array.from({ length: 7 }, (_, index) => addIsoDays(today, index));
  const daySet = new Set(days);
  const events = new Map<string, WeekEvent[]>(days.map((value) => [value, []]));
  for (const booking of bookings) {
    if (booking.archived) continue;
    const start = day(booking.start);
    const end = day(booking.end);
    const dot = dotFor(booking, tasks, today);
    const label = `${booking.customer} · ${placeOf(booking)}`;
    const href = dossierHref(booking.id);
    if (start && daySet.has(start)) {
      events.get(start)!.push({ id: `${booking.id}-depart`, kind: "depart", label, dot, href });
    }
    if (end && daySet.has(end)) {
      events.get(end)!.push({ id: `${booking.id}-retour`, kind: "retour", label, dot, href });
    }
    if (start && start < today && (!end || end >= today) && !(end === today)) {
      events.get(today)!.push({ id: `${booking.id}-place`, kind: "sur_place", label, dot, href });
    }
  }
  const order = { depart: 0, sur_place: 1, retour: 2 };
  return days.map((value) => ({
    day: value,
    events: (events.get(value) || [])
      .sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label, "fr"))
      .slice(0, 5),
  }));
}

function cardOf(booking: RefonteBookingInput, tasks: RefonteTask[], today: string): KanbanCard {
  return {
    id: booking.id,
    href: dossierHref(booking.id),
    customer: booking.customer,
    place: placeOf(booking),
    reference: booking.reference,
    when: whenLabel(booking.start, booking.end),
    dot: dotFor(booking, tasks, today),
  };
}

function buildColumns(bookings: RefonteBookingInput[], tasks: RefonteTask[], today: string) {
  return REFONTE_COLUMNS.map((column) => {
    const rows = bookings
      .filter((booking) => refonteColumn(booking, today) === column.id)
      .sort((a, b) => (day(a.start) || "9999").localeCompare(day(b.start) || "9999") || a.reference.localeCompare(b.reference));
    return {
      id: column.id,
      label: column.label,
      total: rows.length,
      cards: rows.slice(0, 8).map((booking) => cardOf(booking, tasks, today)),
    };
  });
}

function buildStuck(bookings: RefonteBookingInput[], tasks: RefonteTask[], today: string): StuckCard[] {
  const limit = addIsoDays(today, -14);
  const horizon = addIsoDays(today, 60);
  return bookings
    .filter((booking) => {
      const column = refonteColumn(booking, today);
      if (column !== "preparation" && column !== "visible") return false;
      const updated = day(booking.updatedAt);
      if (!updated || updated > limit) return false;
      const start = day(booking.start);
      return !start || start <= horizon;
    })
    .sort((a, b) => (day(a.start) || "9999").localeCompare(day(b.start) || "9999"))
    .slice(0, 8)
    .map((booking) => ({ ...cardOf(booking, tasks, today), since: day(booking.updatedAt) }));
}

function buildMessages(input: RefonteBuildInput, byId: Map<string, RefonteBookingInput>): MessageRow[] {
  const rows: MessageRow[] = [];
  const latest = new Map<string, RefonteWhatsappInput>();
  const sortedWa = [...input.whatsapp].sort((a, b) => b.at.localeCompare(a.at));
  for (const message of sortedWa) {
    if (!latest.has(message.customerId)) latest.set(message.customerId, message);
  }
  for (const message of latest.values()) {
    const booking = message.bookingId ? byId.get(message.bookingId) : undefined;
    const customer = booking?.customer || "Client";
    rows.push({
      id: `wa-${message.id}`,
      channel: "whatsapp",
      title: customer,
      preview: message.preview || "Message",
      at: message.at,
      href: booking ? dossierHref(booking.id) : `${REFONTE_PREFIX}/messages?canal=whatsapp`,
      waiting: message.direction === "inbound",
    });
  }
  for (const row of input.concierge) {
    const booking = row.bookingId ? byId.get(row.bookingId) : undefined;
    rows.push({
      id: `cq-${row.id}`,
      channel: "whatsapp",
      title: booking?.customer || "Concierge",
      preview: row.label,
      at: row.at,
      href: booking ? dossierHref(booking.id) : `${REFONTE_PREFIX}/messages?canal=whatsapp`,
      waiting: true,
    });
  }
  for (const mail of input.mails) {
    const booking = byId.get(mail.bookingId);
    rows.push({
      id: `hm-${mail.id}`,
      channel: "mail",
      title: booking ? `${booking.customer} · ${placeOf(booking)}` : "Courrier hôtel",
      preview: mail.preview || "Courrier",
      at: mail.at,
      href: mail.bookingId ? dossierHref(mail.bookingId) : `${REFONTE_PREFIX}/messages?canal=mail`,
      waiting: mail.waiting,
    });
  }
  for (const email of input.emails) {
    const booking = email.bookingId ? byId.get(email.bookingId) : undefined;
    rows.push({
      id: `im-${email.id}`,
      channel: "import",
      title: email.label || "Boîte d’import",
      preview: email.preview || "Pièce à relire",
      at: email.at,
      href: booking ? dossierHref(booking.id) : `${REFONTE_PREFIX}/messages?canal=import`,
      waiting: email.waiting,
    });
  }
  rows.sort((a, b) => Number(b.waiting) - Number(a.waiting) || (b.at || "").localeCompare(a.at || ""));
  return rows.slice(0, 80);
}

function buildClients(bookings: RefonteBookingInput[], today: string): ClientRow[] {
  const map = new Map<string, { label: string; rows: RefonteBookingInput[] }>();
  for (const booking of bookings) {
    const current = map.get(booking.customerId);
    if (current) current.rows.push(booking);
    else map.set(booking.customerId, { label: booking.customer, rows: [booking] });
  }
  return [...map.entries()]
    .map(([id, value]) => {
      const upcoming = value.rows
        .filter((booking) => !booking.archived && (!day(booking.end) || day(booking.end) >= today))
        .sort((a, b) => (day(a.start) || "9999").localeCompare(day(b.start) || "9999"));
      const next = upcoming[0] || value.rows[0];
      return {
        id,
        label: value.label,
        dossiers: value.rows.length,
        next: next ? placeOf(next) : null,
        href: next ? dossierHref(next.id) : `${REFONTE_PREFIX}/clients`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

function buildSearch(clients: ClientRow[], bookings: RefonteBookingInput[], messages: MessageRow[]): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const client of clients) {
    hits.push({ id: `c-${client.id}`, href: client.href, label: client.label, hint: "Client", kind: "client" });
  }
  for (const booking of bookings) {
    hits.push({
      id: `d-${booking.id}`,
      href: dossierHref(booking.id),
      label: `${booking.customer} · ${placeOf(booking)}`,
      hint: booking.reference || "Dossier",
      kind: "dossier",
    });
  }
  for (const message of messages.filter((row) => row.waiting).slice(0, 20)) {
    hits.push({
      id: `m-${message.id}`,
      href: message.href,
      label: message.title,
      hint: message.preview.slice(0, 80),
      kind: "message",
    });
  }
  return hits.slice(0, 240);
}

function buildTimeline(booking: RefonteBookingInput, items: RefonteItemInput[], input: RefonteBuildInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const item of items) {
    if (!item.active) continue;
    events.push({
      id: `item-${item.id}`,
      at: item.start || item.end,
      title: item.title || "Étape",
      detail: item.kind === "hotel" ? (item.confirmed ? "Confirmation enregistrée" : "Confirmation manquante") : "Étape du séjour",
      channel: "etape",
    });
  }
  for (const message of input.whatsapp.filter((row) => row.customerId === booking.customerId || row.bookingId === booking.id)) {
    events.push({
      id: `tl-wa-${message.id}`,
      at: message.at,
      title: message.direction === "inbound" ? "WhatsApp reçu" : "WhatsApp envoyé",
      detail: message.preview,
      channel: "whatsapp",
    });
  }
  for (const mail of input.mails.filter((row) => row.bookingId === booking.id)) {
    events.push({
      id: `tl-mail-${mail.id}`,
      at: mail.at,
      title: mail.waiting ? "Courrier sans réponse" : "Courrier hôtel",
      detail: mail.preview,
      channel: "mail",
    });
  }
  for (const email of input.emails.filter((row) => row.bookingId === booking.id)) {
    events.push({
      id: `tl-import-${email.id}`,
      at: email.at,
      title: "Boîte d’import",
      detail: email.preview,
      channel: "import",
    });
  }
  for (const row of input.concierge.filter((item) => item.bookingId === booking.id || item.customerId === booking.customerId)) {
    events.push({
      id: `tl-c-${row.id}`,
      at: row.at,
      title: "Concierge",
      detail: row.label,
      channel: "concierge",
    });
  }
  events.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  return events.slice(0, 16);
}

function buildDossier(
  booking: RefonteBookingInput,
  ctx: {
    today: string;
    travelers: RefonteTravelerInput[];
    items: RefonteItemInput[];
    tasks: RefonteTask[];
    messages: MessageRow[];
    timeline: TimelineEvent[];
    cost: number | null;
    balance: number | null;
    openPayment: boolean;
    openFormality: boolean;
  }
): DossierView {
  const column = refonteColumn(booking, ctx.today);
  const end = day(booking.end);
  const past = column === "terminee" || (column === "archivee" && Boolean(end) && end < ctx.today);
  const travelling = column === "voyage";
  const reached: Record<LifecycleStepId, boolean> = {
    preparation: true,
    fournisseurs: !ctx.openPayment,
    formalites: !ctx.openFormality,
    visible: booking.visible || travelling || past,
    voyage: travelling || past,
    terminee: past,
  };
  let current: LifecycleStepId = "preparation";
  if (past) current = "terminee";
  else if (travelling) current = "voyage";
  else if (!reached.fournisseurs) current = "fournisseurs";
  else if (!reached.formalites) current = "formalites";
  else if (!reached.visible) current = "visible";
  else current = "visible";

  const steps = LIFECYCLE_STEPS.map((step) => {
    let state: "done" | "current" | "upcoming" = "upcoming";
    if (step.id === current) state = past && step.id === "terminee" ? "done" : "current";
    else if (reached[step.id] && LIFECYCLE_STEPS.findIndex((row) => row.id === step.id) < LIFECYCLE_STEPS.findIndex((row) => row.id === current)) {
      state = "done";
    } else if (reached[step.id] && step.id !== current) state = "done";
    return { ...step, state };
  });

  let primary = "Séjour prêt";
  if (booking.archived) primary = "Dossier archivé";
  else if (past) primary = "Séjour terminé";
  else if (travelling) primary = "Suivre le séjour";
  else if (!reached.fournisseurs) primary = "Régler le fournisseur";
  else if (!reached.formalites) primary = "Valider la formalité";
  else if (!booking.visible) primary = "Montrer au client";
  else primary = "Séjour prêt";

  const thread = ctx.messages.slice().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const last = ctx.timeline.find((event) => event.channel !== "etape");

  return {
    id: booking.id,
    href: dossierHref(booking.id),
    reference: booking.reference,
    place: placeOf(booking),
    customerId: booking.customerId,
    customer: booking.customer,
    when: whenLabel(booking.start, booking.end),
    column,
    columnLabel: columnLabel(column),
    archived: booking.archived,
    visible: booking.visible,
    travelers: ctx.travelers.map((traveler) => ({
      id: traveler.id,
      label: traveler.label,
      hasPassport: traveler.hasPassport,
    })),
    items: ctx.items
      .filter((item) => item.active)
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title || "Étape",
        when: whenLabel(item.start, item.end),
        confirmed: item.confirmed,
      })),
    tasks: ctx.tasks,
    timeline: ctx.timeline,
    messages: thread,
    lastMessage: last?.detail || thread[0]?.preview || null,
    finance: dossierFinance(booking, ctx.cost, ctx.balance),
    cardCount: booking.cardCount,
    steps,
    primary,
  };
}

export const DOSSIER_TABS = [
  { id: "client", label: "Client" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "voyage", label: "Le voyage" },
  { id: "faire", label: "À faire" },
  { id: "carte", label: "Carte" },
  { id: "reglement", label: "Règlement" },
  { id: "interface", label: "Interface client" },
] as const;

export type DossierTabId = (typeof DOSSIER_TABS)[number]["id"];

export function dossierTab(value: string | null | undefined): DossierTabId {
  const found = DOSSIER_TABS.find((tab) => tab.id === value);
  return found?.id || "voyage";
}

export function dossierTabHref(id: string, tab: DossierTabId) {
  if (tab === "voyage") return dossierHref(id);
  return `${dossierHref(id)}?onglet=${tab}`;
}
