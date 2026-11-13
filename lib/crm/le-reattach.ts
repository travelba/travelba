import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuditRow } from "@/lib/crm/audit-events";
import { hotelBookingStem, hotelRefTokens, hotelRefsShareBooking } from "@/lib/crm/item-match";
import { LittleEmperorsError, splitGuestName } from "@/lib/crm/little-emperors";
import { foldName, lastNamesMatch, namesReferToSamePerson, type PersonName } from "@/lib/crm/person-match";

type Admin = SupabaseClient;

const FOLLOW_ITEM = [
  "crm_booking_documents",
  "crm_hotel_requests",
  "crm_hotel_messages",
  "crm_hotel_arrivals",
  "crm_hotel_thread_messages",
  "crm_trip_costs",
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

  const { data: targetItems, error: orderError } = await admin
    .from("crm_booking_items")
    .select("sort_order")
    .eq("booking_id", target.id);
  if (orderError) fail("Le rattachement n’a pas été enregistré.", 500, "link");
  let sort = 0;
  for (const row of (targetItems || []) as { sort_order?: number | null }[]) {
    const value = Number(row.sort_order);
    if (Number.isFinite(value) && value > sort) sort = value;
  }
  for (const card of cards) {
    sort += 1;
    const { error } = await admin
      .from("crm_booking_items")
      .update({ booking_id: target.id, sort_order: sort })
      .eq("id", card.id);
    if (error) fail("Le rattachement n’a pas été enregistré.", 500, "link");
  }
  const cardIds = cards.map((card) => card.id);
  if (cardIds.length) {
    for (const table of FOLLOW_ITEM) {
      const { error } = await admin.from(table).update({ booking_id: target.id }).in("booking_item_id", cardIds);
      if (error) fail("Le rattachement n’a pas été enregistré.", 500, "link");
    }
  }
  for (const row of linked) {
    const { error } = await admin
      .from("crm_le_bookings")
      .update({ crm_booking_id: target.id, status: "linked", last_error: null })
      .eq("id", row.id);
    if (error) fail("Le rattachement n’a pas été enregistré.", 500, "link");
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
  const journal = deps.journal ?? defaultJournal;
  await journal({
    staffId: input.staffId || null,
    action: "update",
    entityType: "dossier",
    entityId: target.id,
    summary,
    diff,
    path: "/admin/reservations",
  });
  await journal({
    staffId: input.staffId || null,
    action: "update",
    entityType: "dossier",
    entityId: source.id,
    summary,
    diff,
    path: "/admin/reservations",
  });
  const { error: auditError } = await admin.from("crm_audit_events").insert(
    toAuditRow({
      actorKind: "human",
      actorId: input.staffId || null,
      action: "le_reattach",
      bookingId: target.id,
      customerId: target.customer_id,
      summary,
      detail: diff,
      source: "little_emperors",
    })
  );
  if (auditError) fail("Journal non écrit.", 500, "journal");

  return { ...preview, apercu: false as const, ecrit: true as const };
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
