import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { flightCardTitle, flightIata, hotelDisplayName, itemClock } from "@/lib/crm/carnet";
import { itemSellingAmount } from "@/lib/crm/bookings";
import { ticketTravelerNames } from "@/lib/crm/document-passengers";
import { McpWriteError } from "@/lib/crm/mcp-write";
import {
  addHotel,
  addVol,
  addVoyageur,
  updateVol,
  buildFlightCard,
  buildHotelCard,
  createDossier,
  flightPrice,
  flightSchedule,
  hotelPrice,
  isoCurrencyCode,
  travelerSex,
} from "@/lib/crm/mcp-trip";
import type { CrmBookingItem } from "@/lib/crm/types";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PASSPORT = "12AB34567";

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  const writes: { table: string; op: string }[] = [];
  let seq = 1;

  function nextId() {
    const n = String(seq++).padStart(12, "0");
    return `00000000-0000-4000-8000-${n}`;
  }

  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row = {};
    let limitN: number | null = null;
    let orderCol: string | null = null;
    const api = {
      select() {
        return api;
      },
      insert(value: Row) {
        op = "insert";
        payload = value;
        return api;
      },
      update(value: Row) {
        op = "update";
        payload = value;
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      neq(column: string, value: unknown) {
        filters.push((row) => row[column] !== value);
        return api;
      },
      is(column: string, value: unknown) {
        filters.push((row) => (value == null ? row[column] == null : row[column] === value));
        return api;
      },
      in(column: string, values: unknown[]) {
        const allowed = new Set(values);
        filters.push((row) => allowed.has(row[column]));
        return api;
      },
      order(column: string) {
        orderCol = column;
        return api;
      },
      limit(count: number) {
        limitN = count;
        return api;
      },
      maybeSingle() {
        return Promise.resolve(finish(true));
      },
      single() {
        return Promise.resolve(finish(false));
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void, reject?: (err: unknown) => void) {
        return Promise.resolve(list()).then(resolve, reject);
      },
    };

    function matched() {
      let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (orderCol) {
        const column = orderCol;
        rows = [...rows].sort((a, b) => Number(a[column] || 0) - Number(b[column] || 0));
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows;
    }

    function apply() {
      if (op === "insert") {
        writes.push({ table, op });
        const row = { ...payload, id: typeof payload.id === "string" ? payload.id : nextId() };
        tables[table].push(row);
        return [row];
      }
      if (op === "update") {
        writes.push({ table, op });
        const hits = tables[table].filter((row) => filters.every((filter) => filter(row)));
        for (const row of hits) Object.assign(row, payload);
        return hits;
      }
      if (op === "delete") {
        writes.push({ table, op });
        const removed = tables[table].filter((row) => filters.every((filter) => filter(row)));
        tables[table] = tables[table].filter((row) => !removed.includes(row));
        return removed;
      }
      return matched();
    }

    function list() {
      return { data: apply(), error: null };
    }

    function finish(allowEmpty: boolean) {
      const rows = apply();
      if (rows.length === 1) return { data: rows[0], error: null };
      if (allowEmpty && rows.length === 0) return { data: null, error: null };
      return { data: null, error: { message: rows.length ? "several" : "none", code: "PGRST116" } };
    }

    return api;
  }

  return {
    from,
    rpc(name: string) {
      if (name === "crm_next_booking_reference") return Promise.resolve({ data: "TB-2026-0108", error: null });
      return Promise.resolve({ data: null, error: { message: "rpc", code: "42883" } });
    },
    tables,
    writes,
  };
}

function adminOf(seed: Record<string, Row[]>) {
  const db = memoryAdmin(seed);
  return { db, client: db as unknown as SupabaseClient };
}

function customer(id: string, first: string, last: string): Row {
  return {
    id,
    first_name: first,
    last_name: last,
    company_role: null,
    billing_parent_id: null,
    birth_date: null,
    sex: null,
    nationality: null,
    phone: null,
  };
}

function card(row: Row) {
  return row as unknown as CrmBookingItem;
}

test("devises, horaires et prix suivent la carte de l’agence", () => {
  assert.equal(isoCurrencyCode("baht"), "THB");
  assert.equal(isoCurrencyCode("€"), "EUR");
  assert.equal(isoCurrencyCode("xyz"), null);
  assert.equal(travelerSex("Madame"), "F");
  assert.equal(travelerSex("Monsieur"), "M");
  const night = flightSchedule("2026-11-02T22:10", "2026-11-02T06:40", 1);
  assert.equal(night.start_at, "2026-11-02T22:10:00");
  assert.equal(night.end_at, "2026-11-03T06:40:00");
  assert.equal(night.notes, "J+1");
  assert.throws(() => flightSchedule("2026-11-03T10:00", "2026-11-02T08:00", 0), McpWriteError);
  const same = flightPrice({ prix: 450, prixTotal: 450, passengers: 1, devise: "EUR", dossierDevise: "EUR" });
  assert.equal(same.amount, 450);
  assert.equal(same.documentAmount, null);
  const shared = flightPrice({ prix: null, prixTotal: 900, passengers: 2, devise: null, dossierDevise: "EUR" });
  assert.equal(shared.amount, 450);
  assert.equal(shared.ticketCount, 2);
  assert.throws(
    () => flightPrice({ prix: 100, prixTotal: 500, passengers: 2, devise: "EUR", dossierDevise: "EUR" }),
    /ne correspondent pas/
  );
  const foreign = hotelPrice({ prix: 12000, devise: "THB", dossierDevise: "EUR" });
  assert.equal(foreign.amount, null);
  assert.equal(foreign.documentAmount, 12000);
  assert.equal(foreign.documentCurrency, "THB");
  const local = hotelPrice({ prix: 8000, devise: "THB", dossierDevise: "THB" });
  assert.equal(local.amount, 8000);
  assert.equal(local.documentAmount, null);
});

test("une carte vol ou hôtel a la forme lue par le carnet", () => {
  const schedule = flightSchedule("2026-11-02T22:10:00", "2026-11-03T06:40:00", 0);
  const flight = buildFlightCard(
    {
      compagnie: "Air France",
      numero: "AF166",
      depart: "CDG",
      arrivee: "BKK",
      villeDepart: "Paris",
      villeArrivee: "Bangkok",
      cabine: "affaires",
      pnr: "ABC123",
      fournisseur: "Amadeus",
      schedule,
      price: flightPrice({ prix: 450, prixTotal: null, passengers: 1, devise: "EUR", dossierDevise: "EUR" }),
    },
    [
      {
        id: "00000000-0000-4000-8000-000000000099",
        first_name: "Léa",
        last_name: "Martin",
        companion_id: "00000000-0000-4000-8000-000000000098",
        is_account_holder: false,
      },
    ]
  );
  const flightItem = card({ ...flight, id: "x", details: flight.details });
  assert.equal(flightCardTitle(flightItem), "Paris → Bangkok");
  assert.equal(flightIata(flightItem), "CDG → BKK");
  assert.equal(itemClock(flight.start_at), "22h10");
  assert.equal(flight.details.airline_iata, "AF");
  assert.equal(flight.details.notes, "J+1");
  assert.equal(flight.details.departure_timezone, "Europe/Paris");
  assert.equal(flight.details.arrival_timezone, "Asia/Bangkok");
  assert.deepEqual(flight.details.party_keys, ["companion:00000000-0000-4000-8000-000000000098"]);
  assert.deepEqual(ticketTravelerNames(flight.details), ["Léa Martin"]);
  assert.equal(itemSellingAmount({ kind: "flight", amount: flight.amount, details: flight.details }), 450);
  const hotel = buildHotelCard({
    nom: "The Siam",
    ville: "Bangkok",
    pays: "Thaïlande",
    arrivee: "2026-11-03",
    depart: "2026-11-06",
    chambre: "Deluxe",
    pension: "petit-déjeuner",
    inclus: ["petit-déjeuner", "transfert"],
    confirmation: "LE-45821",
    fournisseur: "Little Emperors",
    annulation: "Annulation gratuite jusqu’au 1er novembre.",
    price: hotelPrice({ prix: 12000, devise: "THB", dossierDevise: "EUR" }),
    guests: [],
  });
  const hotelItem = card({ ...hotel, id: "h", details: hotel.details });
  assert.equal(hotelDisplayName(hotelItem), "The Siam");
  assert.equal(hotel.title, "The Siam");
  assert.equal(hotel.details.city, "Bangkok");
  assert.equal(hotel.details.country, "Thaïlande");
  assert.equal(itemClock(hotel.start_at), "");
  assert.equal(hotel.amount, null);
  assert.equal(hotel.details.document_currency, "THB");
  assert.equal(hotel.supplier, "Little Emperors");
});

test("creer_dossier reste en préparation, sans invitation ni débit", async () => {
  const { db, client } = adminOf({
    crm_customers: [customer(CLIENT, "Camille", "Martin")],
    crm_billing_companies: [],
  });
  const created = await createDossier(
    {
      client_id: CLIENT,
      titre: "Thaïlande",
      destination: "Bangkok",
      date_depart: "2026-11-02",
      date_retour: "2026-11-10",
      notes: "Arrivée de nuit",
      notes_internes: "Suite à confirmer",
      devise: "baht",
    },
    client
  );
  assert.equal(created.reference, "TB-2026-0108");
  assert.equal(created.statut, "En préparation");
  assert.equal(created.visible, false);
  assert.equal(created.notifie, false);
  const booking = db.tables.crm_bookings[0];
  assert.equal(booking.id, created.id);
  assert.equal(booking.visible_to_client, false);
  assert.equal(booking.status, "draft");
  assert.equal(booking.currency, "THB");
  assert.equal(booking.customer_id, CLIENT);
  assert.equal(booking.notes_client, "Arrivée de nuit");
  assert.equal(booking.notes_internal, "Suite à confirmer");
  assert.equal(db.tables.crm_transactions?.length || 0, 0);
  assert.equal(db.writes.some((write) => /invite|message|whatsapp/i.test(write.table)), false);
  await assert.rejects(() => createDossier({ client_id: OTHER, titre: "Rome" }, client), /Client introuvable/);
});

test("ajouter_voyageur enregistre le passeport comme la fiche, sans renvoyer le numéro", async () => {
  const { db, client } = adminOf({
    crm_customers: [customer(CLIENT, "Camille", "Martin"), customer(OTHER, "Noah", "Bernard")],
    crm_billing_companies: [],
  });
  const dossier = await createDossier({ client_id: CLIENT, titre: "Thaïlande", devise: "EUR" }, client);
  const added = await addVoyageur(
    {
      dossier_id: dossier.id,
      prenoms: "Léa",
      nom: "Martin",
      civilite: "Madame",
      date_naissance: "1992-04-03",
      lieu_naissance: "Lyon",
      nationalite: "française",
      telephone: "0612345678",
      email: "lea@example.com",
      passeport: {
        numero: PASSPORT,
        delivrance: "2022-01-15",
        expiration: "2032-01-14",
        autorite: "Préfecture de Lyon",
        pays: "Thaïlande",
      },
    },
    client
  );
  assert.equal(added.titulaire, false);
  assert.equal(added.passeport, true);
  assert.equal(added.email_enregistre, false);
  assert.equal(added.notifie, false);
  assert.equal(added.dossier_id, dossier.id);
  assert.equal(JSON.stringify(added).includes(PASSPORT), false);
  const companion = db.tables.crm_travel_companions[0];
  assert.equal(added.compagnon_id, companion.id);
  assert.equal(added.voyageur_id === companion.id, false);
  assert.equal(companion.sex, "F");
  assert.equal(companion.nationality, "FR");
  assert.equal(companion.phone, "+33612345678");
  assert.equal("email" in companion, false);
  assert.equal("place_of_birth" in companion, false);
  const docs = db.tables.crm_travel_documents;
  assert.equal(docs.length, 2);
  for (const doc of docs) {
    assert.equal(doc.number, PASSPORT);
    assert.equal(doc.doc_type, "passport");
    assert.equal(doc.nationality, "FR");
    assert.equal(doc.issuing_country, "TH");
    assert.equal(doc.place_of_birth, "Lyon");
    assert.equal(doc.authority, "Préfecture de Lyon");
    assert.equal(doc.issued_on, "2022-01-15");
    assert.equal(doc.expires_on, "2032-01-14");
  }
  assert.equal(docs.filter((doc) => doc.booking_id == null).length, 1);
  assert.equal(docs.filter((doc) => doc.booking_id === dossier.id && doc.traveler_id === added.voyageur_id).length, 1);
  const holder = await addVoyageur({ dossier_id: dossier.id, prenoms: "Camille", nom: "Martin", sexe: "F" }, client);
  assert.equal(holder.titulaire, true);
  assert.equal(holder.compagnon_id, null);
  assert.equal(db.tables.crm_customers.find((row) => row.id === CLIENT)?.sex, "F");
  await assert.rejects(
    () => addVoyageur({ dossier_id: dossier.id, prenoms: "Léa", nom: "Martin" }, client),
    /déjà sur le séjour/
  );
  await assert.rejects(
    () => addVoyageur({ client_id: OTHER, dossier_id: dossier.id, prenoms: "Inès", nom: "Bernard" }, client),
    /n’appartient pas/
  );
  await assert.rejects(
    () => addVoyageur({ client_id: CLIENT, prenoms: "Léa", nom: "Martin", civilite: "Madame", sexe: "M" }, client),
    /ne correspondent pas/
  );
});

test("ajouter_vol et ajouter_hotel gardent le grand livre d’un séjour caché", async () => {
  const { db, client } = adminOf({
    crm_customers: [customer(CLIENT, "Camille", "Martin")],
    crm_billing_companies: [],
  });
  const dossier = await createDossier(
    { client_id: CLIENT, titre: "Thaïlande", destination: "Bangkok", devise: "EUR" },
    client
  );
  const traveler = await addVoyageur(
    { dossier_id: dossier.id, prenoms: "Léa", nom: "Martin", nationalite: "FR" },
    client
  );
  const flight = await addVol(
    {
      reference: dossier.reference,
      compagnie: "Air France",
      numero: "AF166",
      depart_iata: "cdg",
      arrivee_iata: "bkk",
      ville_depart: "Paris",
      ville_arrivee: "Bangkok",
      depart: "2026-11-02T22:10",
      arrivee: "2026-11-02T06:40",
      decalage_jour: 1,
      cabine: "affaires",
      pnr: "ABC123",
      voyageurs: [traveler.voyageur_id],
      prix: 450,
      fournisseur: "Amadeus",
    },
    client
  );
  assert.equal(flight.titre, "Paris → Bangkok");
  assert.equal(flight.prix_vendu, 450);
  assert.equal(flight.prix_billet, 450);
  assert.equal(flight.billets, 1);
  assert.equal(flight.horaire_depart, "2026-11-02T22:10:00+01:00");
  assert.equal(flight.horaire_arrivee, "2026-11-03T06:40:00+07:00");
  assert.equal(flight.fuseau_depart, "Europe/Paris");
  assert.equal(flight.fuseau_arrivee, "Asia/Bangkok");
  assert.equal(flight.visible, false);
  assert.equal(flight.notifie, false);
  assert.equal(flight.devise_dossier, "EUR");
  const flightRow = db.tables.crm_booking_items.find((row) => row.kind === "flight");
  assert.ok(flightRow);
  assert.equal(flightRow.visible_to_client, false);
  assert.equal(flightRow.include_in_ledger, false);
  assert.equal(flightRow.confirmation_ref, "ABC123");
  assert.equal(flightRow.start_at, "2026-11-02T22:10:00");
  assert.equal(flightRow.end_at, "2026-11-03T06:40:00");
  const details = flightRow.details as Record<string, unknown>;
  assert.equal(details.notes, "J+1");
  assert.equal(details.airline, "Air France");
  assert.equal(details.from, "CDG");
  assert.equal(details.to, "BKK");
  assert.equal(details.departure_timezone, "Europe/Paris");
  assert.equal(details.arrival_timezone, "Asia/Bangkok");
  assert.equal(itemClock(String(flightRow.start_at)), "22h10");
  assert.equal(flightCardTitle(card(flightRow)), "Paris → Bangkok");
  const fee = db.tables.crm_booking_items.find((row) => row.kind === "expense");
  assert.ok(fee);
  assert.equal(fee.amount, 25);
  assert.equal(fee.visible_to_client, false);
  assert.equal((fee.details as Record<string, unknown>).auto_fee, "ticketing");
  assert.equal(db.tables.crm_transactions?.length || 0, 0);

  const hotel = await addHotel(
    {
      dossier_id: dossier.id,
      nom: "The Siam",
      ville: "Bangkok",
      pays: "Thaïlande",
      arrivee: "2026-11-03",
      depart: "2026-11-06",
      chambre: "Deluxe",
      pension: "petit-déjeuner",
      inclus: "petit-déjeuner\ntransfert",
      confirmation: "LE-45821",
      fournisseur: "Little Emperors",
      prix: 12000,
      devise: "THB",
      annulation: "Annulation gratuite jusqu’au 1er novembre.",
      voyageurs: [traveler.voyageur_id],
    },
    client
  );
  assert.equal(hotel.prix_vendu, null);
  assert.equal(hotel.prix_document, 12000);
  assert.equal(hotel.devise, "THB");
  assert.equal(hotel.notifie, false);
  const hotelRow = db.tables.crm_booking_items.find((row) => row.kind === "hotel");
  assert.ok(hotelRow);
  assert.equal(hotelRow.amount, null);
  assert.equal(hotelRow.title, "The Siam");
  assert.equal(hotelRow.supplier, "Little Emperors");
  assert.equal(hotelRow.start_at, "2026-11-03");
  assert.equal(itemClock(String(hotelRow.start_at)), "");
  const hotelDetails = hotelRow.details as Record<string, unknown>;
  assert.equal(hotelDetails.document_amount, 12000);
  assert.equal(hotelDetails.document_currency, "THB");
  assert.equal(hotelDetails.country, "Thaïlande");
  assert.equal(hotelDetails.notes, "Annulation gratuite jusqu’au 1er novembre.");
  assert.deepEqual(hotelDetails.included, ["petit-déjeuner", "transfert"]);
  assert.equal(hotelDisplayName(card(hotelRow)), "The Siam");
  assert.equal(db.tables.crm_transactions?.length || 0, 0);

  const priced = await addHotel(
    {
      dossier_id: dossier.id,
      nom: "Raffles",
      ville: "Singapour",
      pays: "Singapour",
      arrivee: "2026-11-06",
      depart: "2026-11-08",
      prix: 420,
      devise: "EUR",
    },
    client
  );
  assert.equal(priced.prix_vendu, 420);
  assert.equal(priced.prix_document, null);
  const raffles = db.tables.crm_booking_items.find((row) => row.title === "Raffles");
  assert.equal(raffles?.amount, 420);
  assert.equal((raffles?.details as Record<string, unknown>).document_amount, undefined);
  const booking = db.tables.crm_bookings[0];
  assert.equal(booking.visible_to_client, false);
  assert.equal(Number(booking.total_amount) > 0, true);
  assert.equal(db.tables.crm_transactions?.length || 0, 0);
  await assert.rejects(
    () =>
      addVol(
        {
          dossier_id: dossier.id,
          compagnie: "Air France",
          depart_iata: "BKK",
          arrivee_iata: "CDG",
          depart: "2026-11-10T11:00",
          arrivee: "2026-11-10T18:00",
          prix: 100,
          prix_total: 500,
          voyageurs: [traveler.voyageur_id],
        },
        client
      ),
    /ne correspondent pas/
  );
});

test("un hôtel dans la devise du dossier porte le prix vendu", async () => {
  const { db, client } = adminOf({
    crm_customers: [customer(CLIENT, "Camille", "Martin")],
    crm_billing_companies: [],
  });
  const dossier = await createDossier({ client_id: CLIENT, titre: "Bangkok", devise: "THB" }, client);
  const hotel = await addHotel(
    {
      dossier_id: dossier.id,
      nom: "The Siam",
      arrivee: "2026-11-03",
      depart: "2026-11-06",
      prix: "8 000",
      devise: "THB",
    },
    client
  );
  assert.equal(hotel.prix_vendu, 8000);
  assert.equal(hotel.devise_dossier, "THB");
  assert.equal(db.tables.crm_booking_items[0].amount, 8000);
  assert.equal(db.tables.crm_transactions?.length || 0, 0);
});

test("prix_total est le total du groupe, et modifier_vol garde l’heure locale", async () => {
  const { db, client } = adminOf({
    crm_customers: [customer(CLIENT, "Camille", "Martin")],
    crm_billing_companies: [],
  });
  const dossier = await createDossier({ client_id: CLIENT, titre: "Phuket", devise: "EUR" }, client);
  const lea = await addVoyageur({ dossier_id: dossier.id, prenoms: "Léa", nom: "Martin" }, client);
  const camille = await addVoyageur({ dossier_id: dossier.id, prenoms: "Camille", nom: "Martin" }, client);
  const outbound = await addVol(
    {
      dossier_id: dossier.id,
      compagnie: "Thai Airways",
      depart_iata: "CDG",
      arrivee_iata: "HKT",
      depart: "2026-12-25T12:10",
      arrivee: "2026-12-26T05:50",
      voyageurs: [lea.voyageur_id, camille.voyageur_id],
      prix_total: 6990,
    },
    client
  );
  assert.equal(outbound.prix_billet, 3495);
  assert.equal(outbound.prix_vendu, 6990);
  assert.equal(outbound.billets, 2);
  assert.equal(outbound.horaire_depart, "2026-12-25T12:10:00+01:00");
  assert.equal(outbound.horaire_arrivee, "2026-12-26T05:50:00+07:00");
  const outboundRow = db.tables.crm_booking_items.find((row) => row.id === outbound.id);
  assert.equal(outboundRow?.amount, 3495);
  assert.equal(outboundRow?.start_at, "2026-12-25T12:10:00");
  assert.equal(outboundRow?.end_at, "2026-12-26T05:50:00");
  assert.equal(itemClock(String(outboundRow?.start_at)), "12h10");
  assert.equal((outboundRow?.details as Record<string, unknown>).ticket_count, 2);
  assert.equal((outboundRow?.details as Record<string, unknown>).departure_timezone, "Europe/Paris");
  assert.equal((outboundRow?.details as Record<string, unknown>).arrival_timezone, "Asia/Bangkok");

  const inbound = await addVol(
    {
      dossier_id: dossier.id,
      compagnie: "Thai Airways",
      depart_iata: "HKT",
      arrivee_iata: "CDG",
      depart: "2027-01-08T11:55",
      arrivee: "2027-01-08T19:15",
      voyageurs: [lea.voyageur_id, camille.voyageur_id],
      prix_total: 6348,
    },
    client
  );
  assert.equal(inbound.prix_billet, 3174);
  assert.equal(inbound.prix_vendu, 6348);
  assert.equal(inbound.horaire_depart, "2027-01-08T11:55:00+07:00");
  assert.equal(inbound.horaire_arrivee, "2027-01-08T19:15:00+01:00");
  assert.equal(db.tables.crm_bookings[0].total_amount, 13338);
  assert.equal(db.tables.crm_transactions?.length || 0, 0);

  const corrected = await updateVol(
    {
      dossier_id: dossier.id,
      carte_id: outbound.id,
      depart_iata: "CDG",
      arrivee_iata: "HKT",
      depart: "2026-12-25T12:10",
      arrivee: "2026-12-26T05:50",
      prix_total: 6990,
    },
    client
  );
  assert.equal(corrected.prix_billet, 3495);
  assert.equal(corrected.prix_vendu, 6990);
  assert.equal(corrected.billets, 2);
  assert.equal(corrected.horaire_depart, "2026-12-25T12:10:00+01:00");
  assert.equal(corrected.notifie, false);
  const kept = db.tables.crm_booking_items.find((row) => row.id === outbound.id);
  assert.equal(kept?.amount, 3495);
  assert.equal(kept?.start_at, "2026-12-25T12:10:00");
  assert.equal((kept?.details as Record<string, unknown>).ticket_count, 2);
  assert.equal(db.tables.crm_bookings[0].total_amount, 13338);
  assert.equal(db.tables.crm_transactions?.length || 0, 0);
  await assert.rejects(
    () => updateVol({ dossier_id: dossier.id, carte_id: inbound.id, voyageurs: [] }, client),
    /au moins un voyageur/
  );
});

test("ces outils n’envoient ni message ni synchro de formalité", () => {
  const source = readFileSync(new URL("./mcp-trip.ts", import.meta.url), "utf8");
  assert.match(source, /formalities: false/);
  assert.doesNotMatch(source, /scheduleFormalitySync|concierge-send|whatsapp|from ["']@\/lib\/crm\/invite/);
  const bookings = readFileSync(new URL("../../app/api/admin/bookings/route.ts", import.meta.url), "utf8");
  const items = readFileSync(new URL("../../app/api/admin/bookings/[id]/items/route.ts", import.meta.url), "utf8");
  assert.match(bookings, /createStaffBooking/);
  assert.match(items, /addStaffBookingCard/);
  assert.match(items, /scheduleFormalitySync/);
});
