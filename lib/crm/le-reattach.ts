import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuditRow } from "@/lib/crm/audit-events";
import { hotelBookingStem, hotelRefTokens, hotelRefsShareBooking } from "@/lib/crm/item-match";
import { LittleEmperorsError, splitGuestName } from "@/lib/crm/little-emperors";
import { formatDateRangeShort } from "@/lib/crm/money";
import { foldName, lastNamesMatch, namesReferToSamePerson, type PersonName } from "@/lib/crm/person-match";
import { countsAsCarnetCard } from "@/lib/crm/types";

type Admin = SupabaseClient;

const FOLLOW_ITEM = [
  "crm_booking_documents",
  "crm_hotel_requests",
  "crm_hotel_messages",
  "crm_hotel_arrivals",
  "crm_hotel_thread_messages",
  "crm_trip_costs",
  "crm_flight_checkins",
] as const;

type Person = PersonName & { usage_name?: string | null };

type LeRow = {
  id: string;
  confirmation_number: string | null;
  guest_names: string[] | null;
  hotel_name: string | null;
  crm_booking_id: string | null;
};

type Dossier = {
  id: string;
  reference: string | null;
  customer_id: string | null;
  status: string | null;
  archived_at: string | null;
  visible_to_client: boolean | null;
};

type HotelCard = {
  id: string;
  kind: string | null;
  title: string | null;
  confirmation_ref: string | null;
  sort_order: number | null;
  booking_id: string | null;
};

export type ReattachInput = {
  reference: string;
  dossierId?: string | null;
  dossierReference?: string | null;
  confirmer?: boolean;
  accepterClient?: boolean;
  staffId?: string | null;
};

type JournalEntry = {
  staffId: string | null;
  action: "update";
  entityType: "dossier";
  entityId: string;
  summary: string;
  diff: Record<string, unknown>;
  path: string;
};

export type ReattachDeps = {
  admin?: Admin;
  journal?: (entry: JournalEntry) => Promise<void>;
};

function fail(message: string, status: number, code: string): never {
  throw new LittleEmperorsError(message, status, code);
}

/** Même réservation Little Emperors : numéro court, chambre `64570SH…`, ou jeton exact. */
export function leConfirmationMatches(stored: string | null | undefined, query: string) {
  if (hotelRefsShareBooking(stored, query)) return true;
  const asked = new Set(hotelRefTokens(query));
  if (!asked.size) return false;
  return hotelRefTokens(stored).some((token) => asked.has(token));
}

function personViews(person: Person): PersonName[] {
  const views: PersonName[] = [{ first_name: person.first_name, last_name: person.last_name }];
  if (person.usage_name && foldName(person.usage_name) && foldName(person.usage_name) !== foldName(person.last_name)) {
    views.push({ first_name: person.first_name, last_name: person.usage_name });
  }
  return views;
}

function guestHits(guest: string, person: Person) {
  const parsed = splitGuestName(guest);
  if (parsed && personViews(person).some((view) => namesReferToSamePerson(parsed, view))) return true;
  const tokens = foldName(guest).split(" ").filter((token) => token.length >= 2);
  if (tokens.length !== 1) return false;
  return personViews(person).some((view) => lastNamesMatch(tokens[0], view.last_name));
}

/**
 * Le client du dossier cible est cohérent si un voyageur de la réservation
 * est le titulaire ou un voyageur de ce dossier. Sinon il faut accepter_client.
 */
export function leStayMatchesClient(guests: string[], people: Person[]) {
  const names = guests.map((name) => name.trim()).filter(Boolean);
  if (!names.length || !people.length) return false;
  return names.some((guest) => people.some((person) => guestHits(guest, person)));
}

function needleOf(reference: string) {
  return reference.replace(/[%_\\]/g, "").trim();
}

function displayName(person: { first_name?: string | null; last_name?: string | null } | undefined) {
  return [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
}

function moveResume(input: {
  titre: string;
  source: Dossier;
  target: Dossier;
  sourceClient: string;
  targetClient: string;
  suit: string;
}) {
  const from = [input.source.reference, input.sourceClient].filter(Boolean).join(" · ");
  const to = [input.target.reference, input.targetClient].filter(Boolean).join(" · ");
  return [
    `${input.titre} quitte ${from || "le dossier actuel"}.`,
    `Elle rejoint ${to || "le dossier cible"}.`,
    input.suit,
    "Aucun message. Aucun débit. Les cartes Pliant restent.",
  ];
}

function personBits(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((entry) => personBits(entry));
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const name = [row.first_name, row.last_name, row.usage_name]
      .filter((part) => typeof part === "string" && part.trim())
      .join(" ")
      .trim();
    if (name) return [name];
    if (typeof row.name === "string") return [row.name.trim()].filter(Boolean);
  }
  return [];
}

function namesOnItem(details: unknown) {
  const record = details && typeof details === "object" ? (details as Record<string, unknown>) : {};
  return [...new Set([...personBits(record.passengers), ...personBits(record.guests), ...personBits(record.guest_name), ...personBits(record.traveler)])];
}

async function defaultAdmin() {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  return createServiceClient();
}

async function defaultJournal(entry: JournalEntry) {
  const { recordAgencyJournal } = await import("@/lib/crm/agency-log");
  await recordAgencyJournal(entry);
}

async function rowsFor(admin: Admin, needle: string) {
  const { data, error } = await admin
    .from("crm_le_bookings")
    .select("id, confirmation_number, guest_names, hotel_name, crm_booking_id")
    .ilike("confirmation_number", `%${needle}%`);
  if (error) fail("Réservation Little Emperors introuvable.", 404, "not_found");
  return (data || []) as LeRow[];
}

async function dossierBy(admin: Admin, column: "id" | "reference", value: string) {
  const { data, error } = await admin
    .from("crm_bookings")
    .select("id, reference, customer_id, status, archived_at, visible_to_client")
    .eq(column, value)
    .maybeSingle();
  if (error) fail("Dossier introuvable.", 404, "dossier");
  return (data as Dossier | null) || null;
}

async function dossiersByIds(admin: Admin, ids: string[]) {
  if (!ids.length) return [] as Dossier[];
  const { data, error } = await admin
    .from("crm_bookings")
    .select("id, reference, customer_id, status, archived_at, visible_to_client")
    .in("id", ids);
  if (error) fail("Dossier introuvable.", 404, "dossier");
  return (data || []) as Dossier[];
}

async function customersByIds(admin: Admin, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, { first_name: string | null; last_name: string | null }>();
  const { data, error } = await admin.from("crm_customers").select("id, first_name, last_name").in("id", unique);
  if (error) fail("Client introuvable.", 404, "client");
  const map = new Map<string, { first_name: string | null; last_name: string | null }>();
  for (const row of (data || []) as { id: string; first_name: string | null; last_name: string | null }[]) {
    map.set(row.id, row);
  }
  return map;
}

export async function reattachLittleEmperorsReservation(input: ReattachInput, deps: ReattachDeps = {}) {
  const admin = deps.admin ?? (await defaultAdmin());
  const reference = (input.reference || "").trim();
  const needle = needleOf(reference);
  if (needle.length < 5) fail("Indiquez la référence Little Emperors.", 422, "reference");
  const dossierId = (input.dossierId || "").trim();
  const dossierReference = (input.dossierReference || "").trim();
  if (!dossierId && !dossierReference) fail("Indiquez le dossier cible.", 422, "dossier");

  let stored = await rowsFor(admin, needle);
  const stem = hotelBookingStem(reference);
  if (stem && stem !== needle) {
    const more = await rowsFor(admin, stem);
    const seen = new Set(stored.map((row) => row.id));
    stored = stored.concat(more.filter((row) => !seen.has(row.id)));
  }
  const matched = stored.filter((row) => leConfirmationMatches(row.confirmation_number, reference));
  if (!matched.length) fail("Réservation Little Emperors introuvable.", 404, "not_found");
  const linked = matched.filter((row) => row.crm_booking_id);
  if (!linked.length) {
    fail("Cette réservation n’est pas rattachée à un dossier.", 409, "unlinked");
  }
  const sourceIds = [...new Set(linked.map((row) => row.crm_booking_id as string))];
  if (sourceIds.length > 1) {
    const several = await dossiersByIds(admin, sourceIds);
    const labels = sourceIds.map((id) => several.find((row) => row.id === id)?.reference || id);
    fail(`Cette référence est déjà sur plusieurs dossiers : ${labels.join(", ")}.`, 409, "ambiguous");
  }
  const source = await dossierBy(admin, "id", sourceIds[0]);
  if (!source) fail("Le dossier actuel est introuvable.", 404, "dossier");
  const target = dossierId
    ? await dossierBy(admin, "id", dossierId)
    : await dossierBy(admin, "reference", dossierReference);
  if (!target) fail("Dossier cible introuvable.", 404, "dossier");
  if (target.archived_at) fail("Ce dossier est archivé.", 409, "archived");
  if (target.status === "cancelled") fail("Ce dossier est annulé.", 409, "cancelled");

  const guests = [...new Set(linked.flatMap((row) => row.guest_names || []).map((name) => name.trim()).filter(Boolean))];
  const hotel = linked.find((row) => row.hotel_name)?.hotel_name || null;
  const names = await customersByIds(
    admin,
    [source.customer_id, target.customer_id].filter((id): id is string => Boolean(id))
  );
  const { data: travelerRows, error: travelerError } = await admin
    .from("crm_booking_travelers")
    .select("first_name, last_name, usage_name")
    .eq("booking_id", target.id);
  if (travelerError) fail("Dossier cible introuvable.", 404, "dossier");
  const holder = target.customer_id ? names.get(target.customer_id) : undefined;
  const people: Person[] = [
    ...(holder ? [{ first_name: holder.first_name, last_name: holder.last_name }] : []),
    ...((travelerRows || []) as Person[]),
  ];
  const clientCoherent = leStayMatchesClient(guests, people);
  const sourceClient = displayName(source.customer_id ? names.get(source.customer_id) : undefined);
  const targetClient = displayName(holder);

  const { data: sourceItems, error: itemError } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, confirmation_ref, sort_order, booking_id")
    .eq("booking_id", source.id);
  if (itemError) fail("Le rattachement n’a pas été lu.", 500, "link");
  const references = [reference, ...linked.map((row) => row.confirmation_number || "")];
  const cards = ((sourceItems || []) as HotelCard[]).filter(
    (item) => item.kind === "hotel" && references.some((ref) => leConfirmationMatches(item.confirmation_ref, ref))
  );

  const preview = {
    apercu: true as const,
    ecrit: false as const,
    deja: target.id === source.id,
    message: false as const,
    debit_cree: false as const,
    cartes_pliant: "inchangees" as const,
    reference,
    hotel,
    voyageurs: guests,
    de: { id: source.id, reference: source.reference, client: sourceClient || null },
    vers: { id: target.id, reference: target.reference, client: targetClient || null },
    client_coherent: clientCoherent,
    accepter_client_requis: !clientCoherent && target.id !== source.id,
    cartes: cards.map((card) => ({
      id: card.id,
      titre: card.title,
      reference: card.confirmation_ref,
    })),
    titre: hotel,
    resume: moveResume({
      titre: hotel || "Cette réservation",
      source,
      target,
      sourceClient,
      targetClient,
      suit: cards.length ? "La carte hôtel suit, avec ses pièces, ses courriers et ses coûts déjà posés." : "Aucune carte hôtel ne suit.",
    }),
  };
  if (preview.deja || input.confirmer !== true) return preview;
  if (!clientCoherent && input.accepterClient !== true) {
    const cited = guests.length ? guests.join(", ") : "aucun voyageur";
    fail(
      `Le dossier ${target.reference || "cible"} est au nom de ${targetClient || "un autre client"}. La réservation cite ${cited}. Confirmez avec accepter_client.`,
      409,
      "client"
    );
  }

  const summary = `Réservation Little Emperors ${reference} déplacée de ${source.reference || "l’ancien dossier"} vers ${target.reference || "le dossier cible"}.`;
  const diff = {
    reference,
    hotel,
    de: source.reference,
    vers: target.reference,
    cartes: cards.map((card) => card.id),
    message: false,
    debit_cree: false,
    cartes_pliant: "inchangees",
    accepter_client: input.accepterClient === true,
  };
  await commitDossierMove(admin, deps, {
    cards,
    leIds: linked.map((row) => row.id),
    source,
    target,
    summary,
    diff,
    staffId: input.staffId,
    auditAction: "le_reattach",
    auditSource: "little_emperors",
  });
  return { ...preview, apercu: false as const, ecrit: true as const };
}

export async function commitDossierMove(
  admin: Admin,
  deps: ReattachDeps,
  move: {
    cards: HotelCard[];
    leIds: string[];
    source: Dossier;
    target: Dossier;
    summary: string;
    diff: Record<string, unknown>;
    staffId?: string | null;
    auditAction: string;
    auditSource: string;
  }
) {
  const { data: targetItems, error: orderError } = await admin
    .from("crm_booking_items")
    .select("sort_order")
    .eq("booking_id", move.target.id);
  if (orderError) fail("Le rattachement n’a pas été enregistré.", 500, "link");
  let sort = 0;
  for (const row of (targetItems || []) as { sort_order?: number | null }[]) {
    const value = Number(row.sort_order);
    if (Number.isFinite(value) && value > sort) sort = value;
  }
  for (const card of move.cards) {
    sort += 1;
    const { error } = await admin
      .from("crm_booking_items")
      .update({ booking_id: move.target.id, sort_order: sort })
      .eq("id", card.id);
    if (error) fail("Le rattachement n’a pas été enregistré.", 500, "link");
  }
  const cardIds = move.cards.map((card) => card.id);
  if (cardIds.length) {
    for (const table of FOLLOW_ITEM) {
      const { error } = await admin.from(table).update({ booking_id: move.target.id }).in("booking_item_id", cardIds);
      if (error) fail("Le rattachement n’a pas été enregistré.", 500, "link");
    }
  }
  for (const id of move.leIds) {
    const { error } = await admin
      .from("crm_le_bookings")
      .update({ crm_booking_id: move.target.id, status: "linked", last_error: null })
      .eq("id", id);
    if (error) fail("Le rattachement n’a pas été enregistré.", 500, "link");
  }
  const journal = deps.journal ?? defaultJournal;
  const entry = {
    staffId: move.staffId || null,
    action: "update" as const,
    entityType: "dossier" as const,
    summary: move.summary,
    diff: move.diff,
    path: "/admin/reservations",
  };
  await journal({ ...entry, entityId: move.target.id });
  await journal({ ...entry, entityId: move.source.id });
  const { error: auditError } = await admin.from("crm_audit_events").insert(
    toAuditRow({
      actorKind: "human",
      actorId: move.staffId || null,
      action: move.auditAction,
      bookingId: move.target.id,
      customerId: move.target.customer_id,
      summary: move.summary,
      detail: move.diff,
      source: move.auditSource,
    })
  );
  if (auditError) fail("Journal non écrit.", 500, "journal");
}

const SEARCH_COLUMNS = "id, reference, title, destination, start_date, end_date, customer_id, status, archived_at, visible_to_client";

async function ilikeRows(admin: Admin, table: string, column: string, pattern: string, columns: string) {
  const { data, error } = await admin.from(table).select(columns).ilike(column, pattern);
  if (error) return [] as Record<string, unknown>[];
  return (data || []) as unknown as Record<string, unknown>[];
}

export type DossierChoice = {
  id: string;
  reference: string | null;
  client: string | null;
  titre: string | null;
  destination: string | null;
  dates: string | null;
};

/** Dossiers ouverts : nom du client, voyageur, destination, titre ou référence. */
export async function searchDossiersForMove(query: string, excludeId?: string | null, deps: ReattachDeps = {}) {
  const admin = deps.admin ?? (await defaultAdmin());
  const needle = query.replace(/[%_,.()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (needle.replace(/ /g, "").length < 2) return [] as DossierChoice[];
  const like = `%${needle}%`;
  const [byFirst, byLast, travelersFirst, travelersLast, byTitle, byDestination, byReference] = await Promise.all([
    ilikeRows(admin, "crm_customers", "first_name", like, "id"),
    ilikeRows(admin, "crm_customers", "last_name", like, "id"),
    ilikeRows(admin, "crm_booking_travelers", "first_name", like, "booking_id"),
    ilikeRows(admin, "crm_booking_travelers", "last_name", like, "booking_id"),
    ilikeRows(admin, "crm_bookings", "title", like, "id"),
    ilikeRows(admin, "crm_bookings", "destination", like, "id"),
    ilikeRows(admin, "crm_bookings", "reference", like, "id"),
  ]);
  const customerIds = [...new Set([...byFirst, ...byLast].map((row) => String(row.id || "")).filter(Boolean))];
  const bookingIds = [
    ...new Set(
      [...travelersFirst, ...travelersLast, ...byTitle, ...byDestination, ...byReference]
        .map((row) => String(row.booking_id || row.id || ""))
        .filter(Boolean)
    ),
  ];
  const batches = await Promise.all([
    customerIds.length
      ? admin.from("crm_bookings").select(SEARCH_COLUMNS).in("customer_id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length
      ? admin.from("crm_bookings").select(SEARCH_COLUMNS).in("id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const merged = new Map<string, Dossier & { title?: string | null; destination?: string | null; start_date?: string | null; end_date?: string | null }>();
  for (const batch of batches) {
    if (batch.error) continue;
    for (const row of (batch.data || []) as (Dossier & { title?: string | null; destination?: string | null; start_date?: string | null; end_date?: string | null })[]) {
      if (!row?.id || row.id === excludeId || row.archived_at || row.status === "cancelled") continue;
      merged.set(row.id, row);
    }
  }
  const rows = [...merged.values()].slice(0, 8);
  const customers = await customersByIds(
    admin,
    rows.map((row) => row.customer_id).filter((id): id is string => Boolean(id))
  );
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    client: displayName(row.customer_id ? customers.get(row.customer_id) : undefined) || null,
    titre: row.title || null,
    destination: row.destination || null,
    dates: row.start_date || row.end_date ? formatDateRangeShort(row.start_date, row.end_date) : null,
  }));
}

async function resolveTarget(admin: Admin, dossierId?: string | null, dossierReference?: string | null) {
  const id = (dossierId || "").trim();
  const reference = (dossierReference || "").trim();
  if (!id && !reference) fail("Indiquez le dossier cible.", 422, "dossier");
  const target = id ? await dossierBy(admin, "id", id) : await dossierBy(admin, "reference", reference);
  if (!target) fail("Dossier cible introuvable.", 404, "dossier");
  if (target.archived_at) fail("Ce dossier est archivé.", 409, "archived");
  if (target.status === "cancelled") fail("Ce dossier est annulé.", 409, "cancelled");
  return target;
}

async function partyOf(admin: Admin, dossier: Dossier) {
  const customers = await customersByIds(admin, dossier.customer_id ? [dossier.customer_id] : []);
  const { data, error } = await admin
    .from("crm_booking_travelers")
    .select("first_name, last_name, usage_name")
    .eq("booking_id", dossier.id);
  if (error) fail("Dossier introuvable.", 404, "dossier");
  const holder = dossier.customer_id ? customers.get(dossier.customer_id) : undefined;
  const people: Person[] = [
    ...(holder ? [{ first_name: holder.first_name, last_name: holder.last_name }] : []),
    ...((data || []) as Person[]),
  ];
  return { client: displayName(holder), people, holderName: displayName(holder) };
}

function previewMove(input: {
  titre: string | null;
  source: Dossier;
  target: Dossier;
  sourceClient: string;
  targetClient: string;
  guests: string[];
  cards: { id: string; title?: string | null; confirmation_ref?: string | null }[];
  suit: string;
}) {
  return {
    apercu: true as const,
    ecrit: false as const,
    deja: input.source.id === input.target.id,
    message: false as const,
    debit_cree: false as const,
    cartes_pliant: "inchangees" as const,
    titre: input.titre,
    voyageurs: input.guests,
    de: { id: input.source.id, reference: input.source.reference, client: input.sourceClient || null },
    vers: { id: input.target.id, reference: input.target.reference, client: input.targetClient || null },
    client_coherent: false,
    accepter_client_requis: false,
    cartes: input.cards.map((card) => ({ id: card.id, titre: card.title || null, reference: card.confirmation_ref || null })),
    resume: moveResume({
      titre: input.titre || "Cette étape",
      source: input.source,
      target: input.target,
      sourceClient: input.sourceClient,
      targetClient: input.targetClient,
      suit: input.suit,
    }),
  };
}

export async function moveCarnetStep(
  input: {
    carteId: string;
    sourceBookingId?: string | null;
    dossierId?: string | null;
    dossierReference?: string | null;
    confirmer?: boolean;
    accepterClient?: boolean;
    staffId?: string | null;
  },
  deps: ReattachDeps = {}
) {
  const admin = deps.admin ?? (await defaultAdmin());
  const carteId = (input.carteId || "").trim();
  if (!carteId) fail("Indiquez l’étape.", 422, "carte");
  const { data, error } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, confirmation_ref, sort_order, booking_id, details, supplier")
    .eq("id", carteId)
    .maybeSingle();
  if (error || !data) fail("Étape introuvable.", 404, "carte");
  const item = data as HotelCard & { details?: unknown; supplier?: string | null };
  if (!countsAsCarnetCard(item.kind)) fail("Cette ligne n’est pas une étape du séjour.", 409, "carte");
  if (!item.booking_id) fail("Cette étape n’est pas sur un dossier.", 409, "carte");
  if (input.sourceBookingId && input.sourceBookingId !== item.booking_id) {
    fail("Cette étape n’est pas sur ce dossier.", 409, "carte");
  }
  const source = await dossierBy(admin, "id", item.booking_id);
  if (!source) fail("Le dossier actuel est introuvable.", 404, "dossier");
  const target = await resolveTarget(admin, input.dossierId, input.dossierReference);
  const sourceParty = await partyOf(admin, source);
  const targetParty = await partyOf(admin, target);
  const named = namesOnItem(item.details);
  const guests = named.length
    ? named
    : sourceParty.people.map((person) => displayName(person)).filter(Boolean);
  const clientCoherent = source.customer_id === target.customer_id || leStayMatchesClient(guests, targetParty.people);
  const { data: leRows } = await admin
    .from("crm_le_bookings")
    .select("id, confirmation_number, crm_booking_id")
    .eq("crm_booking_id", source.id);
  const leIds = ((leRows || []) as { id: string; confirmation_number: string | null }[])
    .filter((row) => item.confirmation_ref && leConfirmationMatches(row.confirmation_number, item.confirmation_ref))
    .map((row) => row.id);
  const preview = {
    ...previewMove({
      titre: item.title,
      source,
      target,
      sourceClient: sourceParty.client,
      targetClient: targetParty.client,
      guests,
      cards: [item],
      suit: "L’étape suit, avec ses pièces, ses courriers et ses coûts déjà posés.",
    }),
    client_coherent: clientCoherent,
    accepter_client_requis: !clientCoherent && source.id !== target.id,
  };
  if (preview.deja || input.confirmer !== true) return preview;
  if (!clientCoherent && input.accepterClient !== true) {
    const cited = guests.length ? guests.join(", ") : "aucun voyageur";
    fail(
      `Le dossier ${target.reference || "cible"} est au nom de ${targetParty.client || "un autre client"}. L’étape cite ${cited}. Confirmez avec accepter_client.`,
      409,
      "client"
    );
  }
  const summary = `Étape « ${item.title || "sans titre"} » déplacée de ${source.reference || "l’ancien dossier"} vers ${target.reference || "le dossier cible"}.`;
  await commitDossierMove(admin, deps, {
    cards: [item],
    leIds,
    source,
    target,
    summary,
    diff: {
      carte: item.id,
      titre: item.title,
      de: source.reference,
      vers: target.reference,
      message: false,
      debit_cree: false,
      cartes_pliant: "inchangees",
      accepter_client: input.accepterClient === true,
    },
    staffId: input.staffId,
    auditAction: "deplacer_etape",
    auditSource: "dossier",
  });
  return { ...preview, apercu: false as const, ecrit: true as const };
}

export async function moveSupplierReservation(
  input: ReattachInput & { fournisseur?: string | null },
  deps: ReattachDeps = {}
) {
  const fournisseur = (input.fournisseur || "").trim();
  const little = !fournisseur || /little|emperor/i.test(fournisseur);
  if (little) {
    try {
      return await reattachLittleEmperorsReservation(input, deps);
    } catch (err) {
      if (!(err instanceof LittleEmperorsError) || err.code !== "not_found" || /little|emperor/i.test(fournisseur)) throw err;
    }
  }
  const admin = deps.admin ?? (await defaultAdmin());
  const reference = (input.reference || "").trim();
  const needle = needleOf(reference);
  if (needle.length < 5) fail("Indiquez la référence.", 422, "reference");
  const { data, error } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, confirmation_ref, sort_order, booking_id, details, supplier")
    .ilike("confirmation_ref", `%${needle}%`);
  if (error) fail("Réservation introuvable.", 404, "not_found");
  const cards = ((data || []) as (HotelCard & { details?: unknown; supplier?: string | null })[]).filter((item) => {
    if (!countsAsCarnetCard(item.kind) || !leConfirmationMatches(item.confirmation_ref, reference)) return false;
    if (!fournisseur) return true;
    const folded = foldName(fournisseur);
    return foldName(item.supplier).includes(folded) || foldName(item.title).includes(folded);
  });
  if (!cards.length) fail("Réservation introuvable.", 404, "not_found");
  const sourceIds = [...new Set(cards.map((card) => card.booking_id).filter((id): id is string => Boolean(id)))];
  if (sourceIds.length > 1) {
    const several = await dossiersByIds(admin, sourceIds);
    const labels = sourceIds.map((id) => several.find((row) => row.id === id)?.reference || id);
    fail(`Cette référence est déjà sur plusieurs dossiers : ${labels.join(", ")}.`, 409, "ambiguous");
  }
  const source = await dossierBy(admin, "id", sourceIds[0]);
  if (!source) fail("Le dossier actuel est introuvable.", 404, "dossier");
  const target = await resolveTarget(admin, input.dossierId, input.dossierReference);
  const sourceParty = await partyOf(admin, source);
  const targetParty = await partyOf(admin, target);
  const guests = [
    ...new Set(cards.flatMap((card) => namesOnItem(card.details)).concat(sourceParty.people.map((person) => displayName(person)).filter(Boolean))),
  ];
  const clientCoherent = source.customer_id === target.customer_id || leStayMatchesClient(guests, targetParty.people);
  const preview = {
    ...previewMove({
      titre: cards[0]?.title || fournisseur || reference,
      source,
      target,
      sourceClient: sourceParty.client,
      targetClient: targetParty.client,
      guests,
      cards,
      suit: "La réservation suit, avec ses pièces, ses courriers et ses coûts déjà posés.",
    }),
    reference,
    client_coherent: clientCoherent,
    accepter_client_requis: !clientCoherent && source.id !== target.id,
  };
  if (preview.deja || input.confirmer !== true) return preview;
  if (!clientCoherent && input.accepterClient !== true) {
    fail(
      `Le dossier ${target.reference || "cible"} est au nom de ${targetParty.client || "un autre client"}. La réservation cite ${guests.join(", ") || "aucun voyageur"}. Confirmez avec accepter_client.`,
      409,
      "client"
    );
  }
  const summary = `Réservation ${reference} déplacée de ${source.reference || "l’ancien dossier"} vers ${target.reference || "le dossier cible"}.`;
  await commitDossierMove(admin, deps, {
    cards,
    leIds: [],
    source,
    target,
    summary,
    diff: {
      reference,
      fournisseur: fournisseur || null,
      de: source.reference,
      vers: target.reference,
      cartes: cards.map((card) => card.id),
      message: false,
      debit_cree: false,
      cartes_pliant: "inchangees",
    },
    staffId: input.staffId,
    auditAction: "deplacer_reservation",
    auditSource: "dossier",
  });
  return { ...preview, apercu: false as const, ecrit: true as const };
}

function mcpStaff() {
  return import("@/lib/crm/mcp-auth").then((mod) => mod.currentMcpAccess().staff?.id || null);
}

async function mcpMove(raw: Record<string, unknown>, run: (staffId: string | null) => Promise<unknown>) {
  const { McpWriteError } = await import("@/lib/crm/mcp-write");
  try {
    const dossierId = typeof raw.dossier_id === "string" ? raw.dossier_id.trim() : "";
    const dossierReference = typeof raw.dossier_reference === "string" ? raw.dossier_reference.trim() : "";
    const recherche = typeof raw.recherche === "string" ? raw.recherche.trim() : "";
    if (recherche && !dossierId && !dossierReference) {
      const exclude = typeof raw.dossier_exclu === "string" ? raw.dossier_exclu : null;
      return { ecrit: false, apercu: true, dossiers: await searchDossiersForMove(recherche, exclude) };
    }
    return await run(await mcpStaff());
  } catch (err) {
    if (err instanceof LittleEmperorsError) throw new McpWriteError(err.message);
    if (err instanceof McpWriteError) throw err;
    throw new McpWriteError("Déplacement impossible.");
  }
}

export async function moveStepFromMcp(raw: Record<string, unknown>, deps?: ReattachDeps) {
  return mcpMove(raw, (staffId) =>
    moveCarnetStep(
      {
        carteId: typeof raw.carte_id === "string" ? raw.carte_id : "",
        dossierId: typeof raw.dossier_id === "string" ? raw.dossier_id : null,
        dossierReference: typeof raw.dossier_reference === "string" ? raw.dossier_reference : null,
        confirmer: raw.confirmer === true,
        accepterClient: raw.accepter_client === true,
        staffId,
      },
      deps
    )
  );
}

export async function moveReservationFromMcp(raw: Record<string, unknown>, deps?: ReattachDeps) {
  return mcpMove(raw, (staffId) =>
    moveSupplierReservation(
      {
        reference: typeof raw.reference === "string" ? raw.reference : "",
        fournisseur: typeof raw.fournisseur === "string" ? raw.fournisseur : null,
        dossierId: typeof raw.dossier_id === "string" ? raw.dossier_id : null,
        dossierReference: typeof raw.dossier_reference === "string" ? raw.dossier_reference : null,
        confirmer: raw.confirmer === true,
        accepterClient: raw.accepter_client === true,
        staffId,
      },
      deps
    )
  );
}

export async function reattachLittleEmperorsFromMcp(raw: Record<string, unknown>, deps?: ReattachDeps) {
  const { McpWriteError } = await import("@/lib/crm/mcp-write");
  const { currentMcpAccess } = await import("@/lib/crm/mcp-auth");
  try {
    return await reattachLittleEmperorsReservation(
      {
        reference: typeof raw.reference === "string" ? raw.reference : "",
        dossierId: typeof raw.dossier_id === "string" ? raw.dossier_id : null,
        dossierReference: typeof raw.dossier_reference === "string" ? raw.dossier_reference : null,
        confirmer: raw.confirmer === true,
        accepterClient: raw.accepter_client === true,
        staffId: currentMcpAccess().staff?.id || null,
      },
      deps
    );
  } catch (err) {
    if (err instanceof LittleEmperorsError || err instanceof McpWriteError) {
      throw err instanceof LittleEmperorsError ? new McpWriteError(err.message) : err;
    }
    throw new McpWriteError("Rattachement Little Emperors impossible.");
  }
}
