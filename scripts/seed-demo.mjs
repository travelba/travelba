/**
 * Compte agence + clients fictifs pour tester /admin et /mon-compte.
 *
 *   npm run seed:demo
 *
 * Identifiants (surchargeables via .env.local) :
 *   Agence  /admin/login   CRM_DEMO_AGENCY_EMAIL / CRM_DEMO_AGENCY_PASSWORD
 *   Clients /connexion     CRM_DEMO_CLIENT_PASSWORD
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  };
}

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(".env.local introuvable (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).");
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.");
}

const AGENCY_EMAIL = (process.env.CRM_DEMO_AGENCY_EMAIL || "agence@travelba.fr").toLowerCase();
const AGENCY_PASSWORD = process.env.CRM_DEMO_AGENCY_PASSWORD || "TravelbaAgence2026!";
const CLIENT_PASSWORD = process.env.CRM_DEMO_CLIENT_PASSWORD || "ClientDemo2026!";

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CUSTOMERS = [
  {
    email: "client.demo@travelba.fr",
    first_name: "Marie",
    last_name: "Dupont",
    phone: "+33612345678",
    whatsapp: "+33612345678",
    birth_date: "1988-04-12",
    nationality: "FR",
    address_line: "14 rue des Martyrs",
    postal_code: "75009",
    city: "Paris",
    country: "France",
    companions: [
      {
        first_name: "Pierre",
        last_name: "Dupont",
        birth_date: "1986-09-03",
        sex: "M",
        nationality: "FR",
        relationship: "Conjoint",
      },
    ],
    documents: [
      {
        doc_type: "passport",
        number: "10CD88221",
        issuing_country: "FR",
        issued_on: "2018-03-01",
        expires_on: "2028-03-01",
      },
    ],
    bookings: [], // déjà TBA-DEMO-0001
  },
  {
    email: "jean.martin@demo.travelba.fr",
    first_name: "Jean",
    last_name: "Martin",
    phone: "+33645127890",
    whatsapp: "+33645127890",
    birth_date: "1979-11-21",
    nationality: "FR",
    address_line: "8 place Bellecour",
    postal_code: "69002",
    city: "Lyon",
    country: "France",
    companions: [],
    documents: [
      {
        doc_type: "passport",
        number: "12FR44019",
        issuing_country: "FR",
        issued_on: "2019-06-15",
        expires_on: "2026-11-02",
      },
    ],
    bookings: [
      {
        reference: "TB-SEED-0002",
        title: "New York — salon professionnel",
        destination: "New York, États-Unis",
        status: "travelling",
        start_date: "2026-09-14",
        end_date: "2026-09-19",
        total_amount: 5620,
        notes_client: "Salon Javits Center, hôtel proche de Hudson Yards.",
        notes_internal: "Client régulier — préfère AA / JFK.",
        items: [
          {
            kind: "flight",
            title: "LYS → JFK (aller-retour)",
            supplier: "Air France",
            confirmation_ref: "AF-NYC-8821",
            amount: 1480,
            sort_order: 0,
          },
          {
            kind: "hotel",
            title: "The Times Square EDITION — 4 nuits",
            supplier: "Marriott",
            confirmation_ref: "ED-NYC-441",
            amount: 3640,
            sort_order: 1,
          },
          {
            kind: "transfer",
            title: "Transfert JFK → hôtel",
            supplier: "Blacklane",
            amount: 500,
            sort_order: 2,
          },
        ],
        paid: 5620,
      },
    ],
  },
  {
    email: "sophie.bernard@demo.travelba.fr",
    first_name: "Sophie",
    last_name: "Bernard",
    phone: "+33670881234",
    whatsapp: "+33670881234",
    birth_date: "1992-02-08",
    nationality: "FR",
    address_line: "22 cours de l'Intendance",
    postal_code: "33000",
    city: "Bordeaux",
    country: "France",
    companions: [
      {
        first_name: "Léa",
        last_name: "Bernard",
        birth_date: "2016-07-19",
        sex: "F",
        nationality: "FR",
        relationship: "Enfant",
      },
    ],
    documents: [
      {
        doc_type: "id_card",
        number: "ID-338822",
        issuing_country: "FR",
        issued_on: "2022-01-10",
        expires_on: "2032-01-10",
      },
    ],
    bookings: [
      {
        reference: "TB-SEED-0003",
        title: "Lisbonne en famille",
        destination: "Lisbonne, Portugal",
        status: "quoted",
        start_date: "2026-12-20",
        end_date: "2026-12-27",
        total_amount: 3180,
        notes_client: "Devis en attente — chambres communicantes.",
        notes_internal: "Relancer après le 20 septembre.",
        items: [
          {
            kind: "flight",
            title: "BOD → LIS (aller-retour)",
            supplier: "TAP",
            amount: 780,
            sort_order: 0,
          },
          {
            kind: "hotel",
            title: "Bairro Alto Hotel — 6 nuits",
            supplier: "Bairro Alto Hotel",
            amount: 2400,
            sort_order: 1,
          },
        ],
        paid: 0,
      },
    ],
  },
  {
    email: "lucas.nguyen@demo.travelba.fr",
    first_name: "Lucas",
    last_name: "Nguyen",
    phone: "+33622910044",
    whatsapp: "+33622910044",
    birth_date: "1985-06-30",
    nationality: "FR",
    address_line: "5 avenue de la Grande Armée",
    postal_code: "75016",
    city: "Paris",
    country: "France",
    companions: [],
    documents: [
      {
        doc_type: "passport",
        number: "19NG77102",
        issuing_country: "FR",
        issued_on: "2021-08-20",
        expires_on: "2031-08-20",
      },
    ],
    bookings: [
      {
        reference: "TB-SEED-0004",
        title: "Dubaï — mission Q1",
        destination: "Dubaï, Émirats arabes unis",
        status: "completed",
        start_date: "2026-03-02",
        end_date: "2026-03-07",
        total_amount: 4200,
        notes_client: "Voyage terminé — merci pour l'organisation.",
        notes_internal: "Avoir à reporter sur le prochain dossier.",
        items: [
          {
            kind: "flight",
            title: "CDG → DXB (business)",
            supplier: "Emirates",
            confirmation_ref: "EK-DXB-190",
            amount: 2100,
            sort_order: 0,
          },
          {
            kind: "hotel",
            title: "Mandarin Oriental Jumeira — 4 nuits",
            supplier: "Mandarin Oriental",
            confirmation_ref: "MO-DXB-77",
            amount: 2100,
            sort_order: 1,
          },
        ],
        paid: 5000,
      },
    ],
  },
  {
    email: "amina.benali@demo.travelba.fr",
    first_name: "Amina",
    last_name: "Benali",
    phone: "+33618445590",
    whatsapp: "+33618445590",
    birth_date: "1990-01-17",
    nationality: "FR",
    address_line: "11 promenade des Anglais",
    postal_code: "06000",
    city: "Nice",
    country: "France",
    companions: [],
    documents: [],
    bookings: [
      {
        reference: "TB-SEED-0005",
        title: "Week-end Rome (brouillon)",
        destination: "Rome, Italie",
        status: "draft",
        start_date: "2026-11-06",
        end_date: "2026-11-09",
        total_amount: 0,
        notes_client: null,
        notes_internal: "Premier contact — dates souples.",
        items: [],
        paid: 0,
      },
    ],
  },
  {
    email: "camille.rossi@demo.travelba.fr",
    first_name: "Camille",
    last_name: "Rossi",
    phone: "+33699812033",
    whatsapp: "+33699812033",
    birth_date: "1983-12-04",
    nationality: "FR",
    address_line: "3 rue de la Clef",
    postal_code: "59000",
    city: "Lille",
    country: "France",
    companions: [
      {
        first_name: "Hugo",
        last_name: "Rossi",
        birth_date: "1981-05-22",
        sex: "M",
        nationality: "FR",
        relationship: "Conjoint",
      },
    ],
    documents: [
      {
        doc_type: "passport",
        number: "22RO55018",
        issuing_country: "FR",
        issued_on: "2017-11-11",
        expires_on: "2027-11-11",
      },
    ],
    bookings: [
      {
        reference: "TB-SEED-0006",
        title: "Maldives — lune de miel",
        destination: "Malé, Maldives",
        status: "confirmed",
        start_date: "2026-10-03",
        end_date: "2026-10-14",
        total_amount: 12840,
        notes_client: "Villa sur pilotis, dîner d'anniversaire le 8 octobre.",
        notes_internal: "Acompte non reçu — relance prévue.",
        items: [
          {
            kind: "flight",
            title: "CDG → MLE (aller-retour)",
            supplier: "Qatar Airways",
            confirmation_ref: "QR-MLE-330",
            amount: 2840,
            sort_order: 0,
          },
          {
            kind: "hotel",
            title: "Soneva Fushi — 10 nuits",
            supplier: "Soneva",
            confirmation_ref: "SV-MLE-104",
            amount: 9600,
            sort_order: 1,
          },
          {
            kind: "insurance",
            title: "Assurance voyage premium",
            supplier: "Chapka",
            amount: 400,
            sort_order: 2,
          },
        ],
        paid: 0,
      },
    ],
  },
];

async function findAuthUserByEmail(email) {
  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find((u) => (u.email || "").toLowerCase() === email);
    if (found) return found;
    if (users.length < perPage) return null;
    page += 1;
  }
  return null;
}

async function upsertAuthUser({ email, password, fullName, role }) {
  const existing = await findAuthUserByEmail(email);
  const metadata = {
    first_name: fullName.split(" ")[0] || "",
    last_name: fullName.split(" ").slice(1).join(" "),
    full_name: fullName,
  };
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: { ...existing.app_metadata, crm_role: role, must_set_password: false },
    });
    if (error) throw error;
    return data.user;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: { crm_role: role, must_set_password: false },
  });
  if (error) throw error;
  return data.user;
}

function debitStatuses(status) {
  return status === "confirmed" || status === "travelling" || status === "completed";
}

async function upsertCompanion(customerId, companion) {
  const { data: existing } = await supabase
    .from("crm_travel_companions")
    .select("id")
    .eq("customer_id", customerId)
    .eq("first_name", companion.first_name)
    .eq("last_name", companion.last_name)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabase
    .from("crm_travel_companions")
    .insert({ customer_id: customerId, ...companion })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function upsertDocument(customerId, doc) {
  const { data: existing } = await supabase
    .from("crm_travel_documents")
    .select("id")
    .eq("customer_id", customerId)
    .eq("doc_type", doc.doc_type)
    .eq("number", doc.number)
    .maybeSingle();
  if (existing) return existing.id;
  const { error } = await supabase.from("crm_travel_documents").insert({
    customer_id: customerId,
    ...doc,
  });
  if (error) throw error;
}

async function upsertBooking(customer, booking) {
  const { data: existing } = await supabase
    .from("crm_bookings")
    .select("id")
    .eq("reference", booking.reference)
    .maybeSingle();

  let bookingId = existing?.id;
  if (!bookingId) {
    const { data, error } = await supabase
      .from("crm_bookings")
      .insert({
        customer_id: customer.id,
        reference: booking.reference,
        title: booking.title,
        destination: booking.destination,
        status: booking.status,
        start_date: booking.start_date,
        end_date: booking.end_date,
        currency: "EUR",
        total_amount: booking.total_amount,
        notes_client: booking.notes_client,
        notes_internal: booking.notes_internal,
      })
      .select("id")
      .single();
    if (error) throw error;
    bookingId = data.id;
  }

  const { data: traveler } = await supabase
    .from("crm_booking_travelers")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("is_account_holder", true)
    .maybeSingle();
  if (!traveler) {
    const { error } = await supabase.from("crm_booking_travelers").insert({
      booking_id: bookingId,
      is_account_holder: true,
      first_name: customer.first_name,
      last_name: customer.last_name,
    });
    if (error) throw error;
  }

  for (const item of booking.items || []) {
    const { data: existingItem } = await supabase
      .from("crm_booking_items")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("title", item.title)
      .maybeSingle();
    if (existingItem) continue;
    const { error } = await supabase.from("crm_booking_items").insert({
      booking_id: bookingId,
      ...item,
    });
    if (error) throw error;
  }

  if (debitStatuses(booking.status) && booking.total_amount > 0) {
    const { data: debit } = await supabase
      .from("crm_transactions")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("kind", "booking")
      .eq("direction", "debit")
      .neq("status", "void")
      .maybeSingle();
    if (!debit) {
      const { error } = await supabase.from("crm_transactions").insert({
        customer_id: customer.id,
        booking_id: bookingId,
        direction: "debit",
        kind: "booking",
        amount: booking.total_amount,
        currency: "EUR",
        label: `Réservation ${booking.reference} — ${booking.title}`,
        source: "manual",
        status: "posted",
      });
      if (error) throw error;
    }
  }

  if (booking.paid > 0) {
    const label = `Virement reçu — ${booking.reference}`;
    const { data: credit } = await supabase
      .from("crm_transactions")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("booking_id", bookingId)
      .eq("kind", "transfer")
      .eq("direction", "credit")
      .eq("label", label)
      .maybeSingle();
    if (!credit) {
      const { error } = await supabase.from("crm_transactions").insert({
        customer_id: customer.id,
        booking_id: bookingId,
        direction: "credit",
        kind: "transfer",
        amount: booking.paid,
        currency: "EUR",
        label,
        source: "manual",
        status: "posted",
      });
      if (error) throw error;
    }
  }

  return bookingId;
}

async function main() {
  const agencyUser = await upsertAuthUser({
    email: AGENCY_EMAIL,
    password: AGENCY_PASSWORD,
    fullName: "Agent démo",
    role: "admin",
  });

  const { data: staffRow, error: staffErr } = await supabase
    .from("crm_staff")
    .upsert(
      {
        auth_user_id: agencyUser.id,
        role: "admin",
        full_name: "Agent démo",
      },
      { onConflict: "auth_user_id" }
    )
    .select("id")
    .single();
  if (staffErr) throw staffErr;

  const clientSummaries = [];

  for (const spec of CUSTOMERS) {
    const user = await upsertAuthUser({
      email: spec.email,
      password: CLIENT_PASSWORD,
      fullName: `${spec.first_name} ${spec.last_name}`,
      role: "client",
    });

    const payload = {
      auth_user_id: user.id,
      email: spec.email,
      first_name: spec.first_name,
      last_name: spec.last_name,
      phone: spec.phone,
      whatsapp: spec.whatsapp,
      birth_date: spec.birth_date,
      nationality: spec.nationality,
      address_line: spec.address_line,
      postal_code: spec.postal_code,
      city: spec.city,
      country: spec.country,
      language: "fr",
    };

    const { data: existing } = await supabase
      .from("crm_customers")
      .select("id")
      .eq("email", spec.email)
      .maybeSingle();

    let customer;
    if (existing) {
      const { data, error } = await supabase
        .from("crm_customers")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      customer = data;
    } else {
      const { data, error } = await supabase
        .from("crm_customers")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      customer = data;
    }

    for (const companion of spec.companions) {
      await upsertCompanion(customer.id, companion);
    }
    for (const doc of spec.documents) {
      await upsertDocument(customer.id, doc);
    }
    for (const booking of spec.bookings) {
      await upsertBooking(customer, booking);
    }

    clientSummaries.push({
      name: `${spec.first_name} ${spec.last_name}`,
      email: spec.email,
      city: spec.city,
    });
  }

  console.log("Seed démo OK\n");
  console.log("Agence  →  /admin/login");
  console.log(`  ${AGENCY_EMAIL}`);
  console.log(`  ${AGENCY_PASSWORD}`);
  console.log(`  staff_id ${staffRow.id}`);
  console.log("\nClients  →  /connexion  (code e-mail ou mot de passe)");
  console.log(`  mot de passe commun : ${CLIENT_PASSWORD}`);
  for (const c of clientSummaries) {
    console.log(`  ${c.name.padEnd(18)} ${c.email}  (${c.city})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
