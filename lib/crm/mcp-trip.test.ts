import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { flightCardTitle, flightIata, hotelDisplayName, itemClock } from "@/lib/crm/carnet";
import { itemSellingAmount } from "@/lib/crm/bookings";
import { ticketTravelerNames } from "@/lib/crm/document-passengers";
import { createClient, McpWriteError, updateClient } from "@/lib/crm/mcp-write";
import {
  addAccueilVip,
  addHotel,
  addVol,
  addVoyageur,
  planSupplierNet,
  updateHotel,
  updateVol,
  buildFlightCard,
  buildHotelCard,
  createDossier,
  dossierPayerChoice,
  dropPartyFromDetails,
  flightPrice,
  flightSchedule,
  hotelPrice,
  isoCurrencyCode,
  mergeCompagnon,
  removeCarte,
  removeVoyageur,
  retargetCompanionDetails,
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
  assert.equal(created.paye_par, "particulier");
  assert.equal(created.societe, null);
  const booking = db.tables.crm_bookings[0];
  assert.equal(booking.payer_kind, "personal");
  assert.equal(booking.billing_company_id, null);
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
      adresse: "3 Thanon Khao",
      heure_arrivee: "15:00",
      heure_depart: "12:00",
      photos: [{ url: "https://photos.example/siam.jpg", legende: "Suite" }],
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
  assert.deepEqual(hotelDetails.conditions, ["Annulation gratuite jusqu’au 1er novembre."]);
  assert.equal(hotelDetails.address, "3 Thanon Khao");
  assert.equal(hotelDetails.check_in_time, "15:00");
  assert.equal(hotelDetails.check_out_time, "12:00");
  assert.equal((hotelDetails.photos as { url: string }[])[0]?.url, "https://photos.example/siam.jpg");
  assert.equal(JSON.stringify(hotelDetails).includes("total_cost"), false);
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

  const warned = db.tables.crm_booking_items.find((row) => row.id === outbound.id);
  assert.ok(warned);
  warned.details = {
    ...(warned.details as Record<string, unknown>),
    city_from: "Paris",
    city_to: "Bangkok",
    needs_review: true,
    review_reason: "Les codes IATA de provenance et de destination ne sont pas imprimés",
  };
  warned.title = "Bangkok";
  const cleared = await updateVol(
    { dossier_id: dossier.id, carte_id: outbound.id, depart_iata: "CDG", arrivee_iata: "BKK" },
    client
  );
  assert.equal(cleared.titre, "Paris → Bangkok");
  const clearedRow = db.tables.crm_booking_items.find((row) => row.id === outbound.id);
  assert.equal((clearedRow?.details as Record<string, unknown>).needs_review, undefined);
  assert.equal((clearedRow?.details as Record<string, unknown>).review_reason, undefined);
  assert.equal((clearedRow?.details as Record<string, unknown>).from, "CDG");
  assert.equal((clearedRow?.details as Record<string, unknown>).to, "BKK");

  const other = db.tables.crm_booking_items.find((row) => row.id === inbound.id);
  assert.ok(other);
  other.details = {
    ...(other.details as Record<string, unknown>),
    needs_review: true,
    review_reason: "Horaire illisible.",
  };
  const keptDoubt = await updateVol(
    { dossier_id: dossier.id, carte_id: inbound.id, depart_iata: "HKT", arrivee_iata: "CDG" },
    client
  );
  assert.equal(keptDoubt.notifie, false);
  const keptDoubtRow = db.tables.crm_booking_items.find((row) => row.id === inbound.id);
  assert.equal((keptDoubtRow?.details as Record<string, unknown>).needs_review, true);
  assert.equal((keptDoubtRow?.details as Record<string, unknown>).review_reason, "Horaire illisible.");
  await updateVol(
    { dossier_id: dossier.id, carte_id: inbound.id, effacer_avertissement: true },
    client
  );
  const erased = db.tables.crm_booking_items.find((row) => row.id === inbound.id);
  assert.equal((erased?.details as Record<string, unknown>).needs_review, undefined);
  assert.equal((erased?.details as Record<string, unknown>).review_reason, undefined);
});

test("deux vols à 611,20 et 611,19 sans frais donnent 1 222,39", async () => {
  const { db, client } = adminOf({
    crm_customers: [customer(CLIENT, "Camille", "Martin")],
    crm_billing_companies: [],
  });
  const dossier = await createDossier({ client_id: CLIENT, titre: "Marrakech" }, client);
  const lea = await addVoyageur({ dossier_id: dossier.id, prenoms: "Léa", nom: "Martin" }, client);
  const camille = await addVoyageur({ dossier_id: dossier.id, prenoms: "Camille", nom: "Martin" }, client);
  await addVol(
    {
      dossier_id: dossier.id,
      compagnie: "Air France",
      depart_iata: "ORY",
      arrivee_iata: "RAK",
      depart: "2026-10-08T18:45",
      arrivee: "2026-10-08T21:15",
      prix: 611.2,
      sans_frais: true,
    },
    client
  );
  const back = await addVol(
    {
      dossier_id: dossier.id,
      compagnie: "Air France",
      depart_iata: "RAK",
      arrivee_iata: "ORY",
      depart: "2026-10-11T11:40",
      arrivee: "2026-10-11T16:05",
      prix: 611.19,
      sans_frais: true,
    },
    client
  );
  assert.equal(db.tables.crm_bookings[0].fee_mode, "ticketing_off");
  assert.equal(db.tables.crm_bookings[0].total_amount, 1222.39);
  const moved = await updateVol(
    { dossier_id: dossier.id, carte_id: back.id, voyageur_ids: [lea.voyageur_id, camille.voyageur_id] },
    client
  );
  assert.equal(moved.billets, 2);
  const onlyLea = await updateVol(
    { dossier_id: dossier.id, carte_id: back.id, voyageur_ids: [lea.voyageur_id] },
    client
  );
  assert.equal(onlyLea.billets, 1);
  const passengers = (db.tables.crm_booking_items.find((row) => row.id === back.id)?.details as { passengers?: { first_name?: string }[] })
    .passengers;
  assert.equal(passengers?.length, 1);
  assert.equal(passengers?.[0]?.first_name, "Léa");
  assert.equal(db.tables.crm_bookings[0].total_amount, 1222.39);
});

test("ajouter_accueil_vip exige un vol et suit son horaire", async () => {
  const { db, client } = adminOf({
    crm_customers: [customer(CLIENT, "Camille", "Martin")],
    crm_billing_companies: [],
  });
  const dossier = await createDossier({ client_id: CLIENT, titre: "Phuket & Krabi", devise: "EUR" }, client);
  const arrival = await addVol(
    {
      dossier_id: dossier.id,
      compagnie: "Air France",
      numero: "AF956",
      depart_iata: "CDG",
      arrivee_iata: "HKT",
      ville_depart: "Paris",
      ville_arrivee: "Phuket",
      depart: "2026-12-25T23:20",
      arrivee: "2026-12-26T05:50",
    },
    client
  );
  const departure = await addVol(
    {
      dossier_id: dossier.id,
      compagnie: "Air France",
      numero: "AF157",
      depart_iata: "HKT",
      arrivee_iata: "CDG",
      ville_depart: "Phuket",
      ville_arrivee: "Paris",
      depart: "2027-01-08T11:55",
      arrivee: "2027-01-08T19:15",
    },
    client
  );
  const text = "Ce qui est inclus\n- Arrivée AF956\n- Départ AF157";
  await assert.rejects(
    () =>
      addAccueilVip(
        {
          dossier_id: dossier.id,
          fournisseur: "Coral Thailand",
          type: "arrivee",
          passagers: 2,
          bagages: 4,
          informations: text,
        },
        client
      ),
    /vol/
  );
  await assert.rejects(
    () =>
      addAccueilVip(
        {
          dossier_id: dossier.id,
          fournisseur: "Coral Thailand",
          type: "aller-retour",
          vol_arrivee: arrival.id,
          vol_depart: arrival.id,
          passagers: 2,
          bagages: 4,
          informations: text,
        },
        client
      ),
    /deux vols/
  );
  const vip = await addAccueilVip(
    {
      reference: dossier.reference,
      fournisseur: "Coral Thailand",
      type: "aller_retour",
      vol_arrivee: arrival.id,
      vol_depart: departure.id,
      passagers: 2,
      bagages: 4,
      hotline: "+66 92 915 9515",
      email: "booking@coralthailand.com",
      confirmation: "PNR-021811",
      informations: text,
    },
    client
  );
  assert.equal(vip.notifie, false);
  assert.equal(vip.visible, false);
  assert.equal(vip.titre, "Accueil VIP à Phuket");
  assert.equal(vip.titre.includes("Paris"), false);
  assert.equal(vip.etapes.length, 2);
  assert.equal(vip.etapes[0].horaire, "2026-12-26T05:50:00");
  assert.equal(vip.etapes[0].aeroport, "HKT");
  assert.equal(vip.etapes[1].vol, "AF157");
  const row = db.tables.crm_booking_items.find((item) => item.kind === "accueil_vip");
  assert.equal(row?.include_in_ledger, false);
  assert.equal(row?.amount, null);
  assert.equal(db.tables.crm_transactions?.length || 0, 0);
  await updateVol(
    {
      dossier_id: dossier.id,
      carte_id: arrival.id,
      arrivee: "2026-12-26T06:05",
    },
    client
  );
  const synced = db.tables.crm_booking_items.find((item) => item.id === vip.id);
  const legs = (synced?.details as { legs?: { role: string; at: string }[] }).legs || [];
  assert.equal(legs.find((leg) => leg.role === "arrival")?.at, "2026-12-26T06:05:00");
});

test("une société se facture sur le dossier, sans doublon de SIRET", async () => {
  assert.deepEqual(dossierPayerChoice({ societeId: "", particulier: false, companies: [{ id: "a", sort_order: 0 }] }), {
    payer_kind: "company",
    billing_company_id: "a",
  });
  assert.deepEqual(
    dossierPayerChoice({
      societeId: "",
      particulier: false,
      companies: [
        { id: "b", sort_order: 1 },
        { id: "a", sort_order: 0 },
      ],
    }),
    { payer_kind: "company", billing_company_id: "a" }
  );
  assert.deepEqual(dossierPayerChoice({ societeId: "b", particulier: false, companies: [{ id: "a", sort_order: 0 }, { id: "b", sort_order: 1 }] }), {
    payer_kind: "company",
    billing_company_id: "b",
  });
  assert.deepEqual(dossierPayerChoice({ societeId: "", particulier: true, companies: [{ id: "a", sort_order: 0 }] }), {
    payer_kind: "personal",
    billing_company_id: null,
  });
  assert.equal("error" in dossierPayerChoice({ societeId: "a", particulier: true, companies: [{ id: "a", sort_order: 0 }] }), true);
  assert.deepEqual(dossierPayerChoice({ societeId: "", particulier: false, companies: [] }), {
    payer_kind: "personal",
    billing_company_id: null,
  });
  const { db, client } = adminOf({ crm_customers: [], crm_billing_companies: [] });
  const created = await createClient(
    {
      email: "nilos@example.com",
      prenom: "Camille",
      nom: "Martin",
      raison_sociale: "NILOS FRANCE",
      siret: "732 829 320 00074",
      tva: "FR73282932000",
      adresse: "10 rue de la Paix",
      code_postal: "75002",
      ville: "Paris",
      pays: "France",
    },
    client
  );
  assert.equal(created.invite, false);
  assert.equal(created.societe, "NILOS FRANCE");
  assert.equal(created.siret, "73282932000074");
  assert.equal(db.tables.crm_billing_companies.length, 1);
  const customer = db.tables.crm_customers[0];
  assert.equal(customer.company_name, "NILOS FRANCE");
  assert.equal(customer.siret, "73282932000074");
  assert.equal(customer.billing_city, "Paris");
  assert.equal(customer.billing_country, "FR");
  const updated = await updateClient(
    { id: created.id, siret: "73282932000074", ville: "Lyon" },
    client
  );
  assert.equal(updated.societe_id, created.societe_id);
  assert.equal(db.tables.crm_billing_companies.length, 1);
  assert.equal(db.tables.crm_billing_companies[0].billing_city, "Lyon");
  assert.equal(db.tables.crm_customers[0].billing_city, "Lyon");
  const second = await updateClient(
    { id: created.id, raison_sociale: "EXPONENTIEL", siret: "55210055400013", ville: "Paris" },
    client
  );
  assert.equal(second.societe_id === created.societe_id, false);
  assert.equal(db.tables.crm_billing_companies.length, 2);
  assert.equal(db.tables.crm_customers[0].company_name, "NILOS FRANCE");
  await assert.rejects(() => updateClient({ id: created.id, ville: "Nice" }, client), /Plusieurs sociétés/);
  const primary = await createDossier({ client_id: created.id, titre: "Phuket" }, client);
  assert.equal(primary.paye_par, "société");
  assert.equal(primary.societe, "NILOS FRANCE");
  const billed = await createDossier(
    { client_id: created.id, titre: "Phuket", societe_id: second.societe_id },
    client
  );
  assert.equal(billed.paye_par, "société");
  assert.equal(billed.societe, "EXPONENTIEL");
  assert.equal(billed.notifie, false);
  const booking = db.tables.crm_bookings.find((row) => row.id === billed.id);
  assert.equal(booking?.payer_kind, "company");
  assert.equal(booking?.billing_company_id, second.societe_id);
  assert.equal(booking?.visible_to_client, false);
  const personal = await createDossier({ client_id: created.id, titre: "Rome", particulier: true }, client);
  assert.equal(personal.paye_par, "particulier");
  assert.equal(db.tables.crm_bookings.find((row) => row.id === personal.id)?.payer_kind, "personal");
  assert.equal(db.tables.crm_bookings.find((row) => row.id === personal.id)?.billing_company_id, null);
  const alone = await createClient(
    { email: "seul@example.com", prenom: "Léa", nom: "Martin", societe: "ATELIER" },
    client
  );
  const stay = await createDossier(
    { client_id: alone.id, titre: "Lyon", facturer_societe: true },
    client
  );
  assert.equal(stay.paye_par, "société");
  assert.equal(stay.societe, "ATELIER");
  assert.equal(db.tables.crm_transactions?.length || 0, 0);
  assert.equal(db.writes.some((write) => /invite|message|whatsapp/i.test(write.table)), false);
  const bare = await createClient({ email: "vide@example.com", prenom: "Noa", nom: "Bernard" }, client);
  await assert.rejects(
    () => createDossier({ client_id: bare.id, titre: "Nice", facturer_societe: true }, client),
    /Aucune société/
  );
  await assert.rejects(
    () => createClient({ email: "mauvais@example.com", prenom: "Noa", nom: "Bernard", siret: "123" }, client),
    /14 chiffres/
  );
});

test("un vol à 0 € est accepté, et les frais de billeterie ne s’ouvrent pas", async () => {
  const { db, client } = adminOf({
    crm_customers: [customer(CLIENT, "Camille", "Martin")],
    crm_billing_companies: [],
  });
  const dossier = await createDossier({ client_id: CLIENT, titre: "Tel Aviv", devise: "EUR" }, client);
  const traveler = await addVoyageur({ dossier_id: dossier.id, prenoms: "Léa", nom: "Martin" }, client);
  const flight = await addVol(
    {
      dossier_id: dossier.id,
      compagnie: "El Al",
      numero: "LY320",
      depart_iata: "CDG",
      arrivee_iata: "TLV",
      depart: "2026-12-01T10:00",
      arrivee: "2026-12-01T16:00",
      voyageurs: [traveler.voyageur_id],
      prix_total: 0,
    },
    client
  );
  assert.equal(flight.prix_vendu, 0);
  assert.equal(flight.prix_billet, 0);
  assert.equal(db.tables.crm_booking_items.some((row) => row.kind === "expense"), false);
  assert.equal(db.tables.crm_bookings[0].fee_mode, "ticketing_off");
  assert.equal(db.tables.crm_bookings[0].total_amount, 0);
  await assert.rejects(
    () =>
      updateVol(
        { dossier_id: dossier.id, carte_id: flight.id, prix_total: -1 },
        client
      ),
    /positif ou nul/
  );
});

test("sans_frais retire les frais déjà créés, et retirer_carte annule le débit", async () => {
  const { db, client } = adminOf({
    crm_customers: [customer(CLIENT, "Camille", "Martin")],
    crm_billing_companies: [],
  });
  const dossier = await createDossier({ client_id: CLIENT, titre: "Tel Aviv", devise: "EUR" }, client);
  db.tables.crm_bookings[0].visible_to_client = true;
  const traveler = await addVoyageur({ dossier_id: dossier.id, prenoms: "Léa", nom: "Martin" }, client);
  const flight = await addVol(
    {
      dossier_id: dossier.id,
      compagnie: "El Al",
      numero: "LY320",
      depart_iata: "CDG",
      arrivee_iata: "TLV",
      depart: "2026-12-01T10:00",
      arrivee: "2026-12-01T16:00",
      voyageurs: [traveler.voyageur_id],
      prix: 200,
    },
    client
  );
  const fee = db.tables.crm_booking_items.find((row) => row.kind === "expense");
  assert.equal(fee?.amount, 25);
  const debit = db.tables.crm_transactions.find((row) => String(row.external_id).includes(":expense:"));
  assert.equal(debit?.status, "posted");
  assert.equal(debit?.amount, 25);
  const cleared = await updateVol({ dossier_id: dossier.id, carte_id: flight.id, sans_frais: true }, client);
  assert.equal(cleared.notifie, false);
  assert.equal(db.tables.crm_booking_items.some((row) => row.kind === "expense"), false);
  assert.equal(db.tables.crm_bookings[0].fee_mode, "ticketing_off");
  assert.equal(db.tables.crm_transactions.find((row) => row.id === debit?.id)?.status, "void");
  const again = await addVol(
    {
      dossier_id: dossier.id,
      compagnie: "El Al",
      numero: "LY325",
      depart_iata: "TLV",
      arrivee_iata: "CDG",
      depart: "2026-12-08T10:00",
      arrivee: "2026-12-08T14:00",
      prix: 200,
    },
    client
  );
  assert.equal(db.tables.crm_booking_items.some((row) => row.kind === "expense"), false);
  const removed = await removeCarte({ dossier_id: dossier.id, carte_id: again.id }, client);
  assert.equal(removed.retiree, true);
  assert.equal(removed.notifie, false);
  assert.equal(db.tables.crm_booking_items.some((row) => row.id === again.id), false);
});

test("le nom d’usage et le premier prénom rattachent le compagnon, et le doublon sans pièce se retire", async () => {
  const kept = "33333333-3333-4333-8333-333333333333";
  const thin = "44444444-4444-4444-8444-444444444444";
  const { db, client } = adminOf({
    crm_customers: [customer(CLIENT, "Benjamin", "Martin")],
    crm_billing_companies: [],
    crm_travel_companions: [
      {
        id: kept,
        customer_id: CLIENT,
        first_name: "Victoria Marie Rebecca",
        last_name: "Tetard",
        usage_name: "Martin",
      },
      { id: thin, customer_id: CLIENT, first_name: "Victoria", last_name: "Martin", usage_name: null },
    ],
    crm_travel_documents: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        customer_id: CLIENT,
        companion_id: kept,
        doc_type: "passport",
        number: "SECRET",
      },
    ],
  });
  const dossier = await createDossier({ client_id: CLIENT, titre: "Tel Aviv" }, client);
  const added = await addVoyageur({ dossier_id: dossier.id, prenoms: "Victoria", nom: "Martin" }, client);
  assert.equal(added.compagnon_id, kept);
  assert.equal(added.notifie, false);
  assert.equal(JSON.stringify(added).includes("SECRET"), false);
  assert.equal(db.tables.crm_travel_companions.length, 2);
  const traveler = db.tables.crm_booking_travelers[0];
  assert.equal(traveler.companion_id, kept);
  assert.equal(traveler.first_name, "Victoria Marie Rebecca");
  assert.equal(traveler.last_name, "Tetard");
  await removeVoyageur({ dossier_id: dossier.id, voyageur_id: added.voyageur_id }, client);
  const byId = await addVoyageur({ dossier_id: dossier.id, compagnon_id: thin }, client);
  assert.equal(byId.compagnon_id, thin);
  await addVol(
    {
      dossier_id: dossier.id,
      compagnie: "El Al",
      depart_iata: "CDG",
      arrivee_iata: "TLV",
      depart: "2026-12-01T10:00",
      arrivee: "2026-12-01T16:00",
      voyageurs: [byId.voyageur_id],
      prix_total: 0,
    },
    client
  );
  const merged = await mergeCompagnon({ garder_id: kept, retirer_id: thin }, client);
  assert.equal(merged.notifie, false);
  assert.equal(merged.sejours, 1);
  assert.equal(db.tables.crm_travel_companions.some((row) => row.id === thin), false);
  assert.equal(db.tables.crm_booking_travelers.some((row) => row.companion_id === thin), false);
  const flight = db.tables.crm_booking_items.find((row) => row.kind === "flight");
  const details = flight?.details as { party_keys: string[]; passengers: { last_name: string }[] };
  assert.equal(details.party_keys.includes(`companion:${kept}`), true);
  assert.equal(details.party_keys.includes(`companion:${thin}`), false);
  assert.equal(details.passengers[0].last_name, "Tetard");
  await assert.rejects(
    () => mergeCompagnon({ garder_id: thin, retirer_id: kept }, client),
    /introuvable|pièce/
  );
  const dropped = dropPartyFromDetails(
    { party_keys: ["holder", `companion:${kept}`], passengers: [{ first_name: "A" }, { first_name: "B" }], ticket_count: 2 },
    `companion:${kept}`
  );
  assert.deepEqual(dropped?.party_keys, ["holder"]);
  assert.deepEqual(dropped?.passengers, [{ first_name: "A" }]);
  assert.equal(dropped?.ticket_count, 1);
  const moved = retargetCompanionDetails(
    { party_keys: [`companion:${thin}`], passengers: [{ first_name: "Victoria", last_name: "Martin" }] },
    thin,
    { id: kept, first_name: "Victoria Marie Rebecca", last_name: "Tetard" }
  );
  assert.equal((moved?.party_keys as string[])[0], `companion:${kept}`);
  assert.equal((moved?.passengers as { last_name: string }[])[0].last_name, "Tetard");
  const removed = await removeVoyageur({ dossier_id: dossier.id, compagnon_id: kept }, client);
  assert.equal(removed.retire, true);
  assert.equal(removed.notifie, false);
  assert.equal(db.tables.crm_booking_travelers.some((row) => row.companion_id === kept), false);
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

test("le coût net en dirhams garde l’euro indiqué, sans taux inventé", () => {
  assert.deepEqual(planSupplierNet({ prixNet: 12000, devise: "MAD", prixNetEur: 1160, leNet: null }), {
    supplier_net: 12000,
    supplier_currency: "MAD",
    supplier_net_eur: 1160,
  });
  assert.equal(planSupplierNet({ prixNet: 1160, devise: "EUR", prixNetEur: null, leNet: null })?.supplier_net_eur, 1160);
  assert.equal(planSupplierNet({ prixNet: null, devise: null, prixNetEur: null, leNet: null }), null);
  assert.throws(
    () => planSupplierNet({ prixNet: 100, devise: "EUR", prixNetEur: 90, leNet: null }),
    /ne correspond pas/
  );
});

test("modifier_hotel garde le prix de vente, et l’aligne seulement si prix est indiqué", async () => {
  const { db, client } = adminOf({
    crm_customers: [customer(CLIENT, "Camille", "Martin")],
    crm_billing_companies: [],
  });
  const dossier = await createDossier({ client_id: CLIENT, titre: "Marrakech", devise: "EUR" }, client);
  const traveler = await addVoyageur({ dossier_id: dossier.id, prenoms: "Camille", nom: "Martin" }, client);
  const hotel = await addHotel(
    {
      dossier_id: dossier.id,
      nom: "Hôtel provisoire",
      ville: "Marrakech",
      arrivee: "2026-12-01",
      depart: "2026-12-04",
      prix: 900,
      confirmation: "OLD100",
      voyageurs: [traveler.voyageur_id],
    },
    client
  );
  assert.equal(hotel.prix_vendu, 900);

  const netOnly = await updateHotel(
    {
      dossier_id: dossier.id,
      carte_id: hotel.id,
      nom: "La Mamounia",
      prix_net: "12 000",
      devise_net: "MAD",
      prix_net_eur: 1160,
      pension: "Petit-déjeuner",
      annulation: "Annulation gratuite jusqu’au 1er novembre.",
      avantages: ["Petit-déjeuner", "Surclassement"],
      notes: "Arrivée tardive",
    },
    client
  );
  assert.equal(netOnly.prix_vendu, 900);
  assert.equal(netOnly.prix_net, 12000);
  assert.equal(netOnly.devise_net, "MAD");
  assert.equal(netOnly.prix_net_eur, 1160);
  assert.equal(netOnly.notifie, false);
  const row = db.tables.crm_booking_items.find((item) => item.id === hotel.id);
  assert.equal(row?.amount, 900);
  assert.equal(row?.title, "La Mamounia");
  const details = row?.details as Record<string, unknown>;
  assert.equal(details.supplier_net, 12000);
  assert.equal(details.supplier_currency, "MAD");
  assert.equal(details.supplier_net_eur, 1160);
  assert.equal(details.board, "Petit-déjeuner");
  assert.equal(details.notes, "Arrivée tardive");
  assert.deepEqual(details.conditions, ["Annulation gratuite jusqu’au 1er novembre."]);
  assert.deepEqual(details.included, ["Petit-déjeuner", "Surclassement"]);
  assert.equal(JSON.stringify(details).includes("total_cost"), false);
  assert.equal(db.tables.crm_transactions?.length || 0, 0);

  const sold = await updateHotel(
    { dossier_id: dossier.id, carte_id: hotel.id, prix: 1160 },
    client
  );
  assert.equal(sold.prix_vendu, 1160);
  assert.equal(sold.prix_net, 12000);
  assert.equal(db.tables.crm_booking_items.find((item) => item.id === hotel.id)?.amount, 1160);
  assert.notEqual(sold.prix_vendu, Math.round(1160 * 1.3));

  db.tables.crm_le_bookings = [
    {
      le_booking_id: 90,
      confirmation_number: "64570SH046795",
      state: "booked",
      hotel_id: 44,
      hotel_name: "La Mamounia",
      city: "Marrakech",
      address: "Avenue Bab Jdid",
      check_in: "2026-12-02",
      check_out: "2026-12-06",
      currency: "MAD",
      total_cost: "12000",
      guest_names: ["Camille Martin"],
      room_types: ["Suite"],
      cancellation_policies: ["Free cancellation before 1 Nov"],
      crm_booking_id: dossier.id,
      status: "linked",
      raw: {
        id: 90,
        benefits: ["Complimentary breakfast"],
        board: "Petit-déjeuner",
        public_price: "15000",
        public_currency: "MAD",
        hotel_confirmations: ["H998877"],
      },
    },
  ];
  const fromLe = await updateHotel(
    { dossier_id: dossier.id, carte_id: hotel.id, reference_le: "64570" },
    client
  );
  assert.equal(fromLe.prix_vendu, 1160);
  assert.equal(fromLe.prix_net, 12000);
  assert.equal(fromLe.devise_net, "MAD");
  assert.equal(fromLe.prix_net_eur, 1160);
  assert.equal(fromLe.hotel, "La Mamounia");
  assert.equal(fromLe.arrivee, "2026-12-02");
  const filled = db.tables.crm_booking_items.find((item) => item.id === hotel.id);
  assert.equal(filled?.amount, 1160);
  const filledDetails = filled?.details as Record<string, unknown>;
  assert.equal(filledDetails.address, "Avenue Bab Jdid");
  assert.equal(filledDetails.le_hotel_id, 44);
  assert.deepEqual(filledDetails.included, ["Petit-déjeuner offert"]);
  assert.equal(String(filled?.confirmation_ref).includes("64570SH046795"), true);
  assert.equal(String(filled?.confirmation_ref).includes("H998877"), true);
  assert.equal(String(filled?.confirmation_ref).includes("OLD100"), true);
  assert.equal(filledDetails.document_amount, undefined);
  assert.equal(JSON.stringify(filledDetails).includes("15000"), false);

  const flight = await addVol(
    {
      dossier_id: dossier.id,
      compagnie: "Royal Air Maroc",
      depart_iata: "CDG",
      arrivee_iata: "RAK",
      depart: "2026-12-02T09:00",
      arrivee: "2026-12-02T12:00",
    },
    client
  );
  await assert.rejects(
    () => updateHotel({ dossier_id: dossier.id, carte_id: flight.id, nom: "Autre" }, client),
    /n’est pas un hôtel/
  );
  await assert.rejects(() => updateHotel({ dossier_id: dossier.id, carte_id: hotel.id }, client), /Rien à modifier/);
});
