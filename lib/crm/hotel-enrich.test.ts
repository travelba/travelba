import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planHotelBackfill, runHotelEnrichment, validerFicheHotel } from "./hotel-enrich";
import { mergeHotelProfile, sniffHotelImage, verifyHotelProfile, type HotelProfile } from "./hotel-profile";
import { emptyHotelWebFacts } from "./hotel-web";

const DESCRIPTION =
  "Palace au cœur de Paris, face à la place Vendôme, avec un salon et un jardin intérieur.";

function jpeg() {
  const bytes = new Uint8Array(64);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xd9;
  return bytes;
}

function memoryAdmin(tables: Record<string, Record<string, unknown>[]>) {
  const uploads: string[] = [];
  const updates: { table: string; values: Record<string, unknown> }[] = [];
  function from(table: string) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let limitN = 1000;
    const rows = () => {
      if (!tables[table]) tables[table] = [];
      return tables[table];
    };
    const matched = () => rows().filter((row) => filters.every((fn) => fn(row))).slice(0, limitN);
    const api = {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => row[col] === val);
        return api;
      },
      ilike(col: string, pattern: string) {
        const token = pattern.replace(/%/g, "").toLowerCase();
        filters.push((row) => String(row[col] || "").toLowerCase().includes(token));
        return api;
      },
      contains(col: string, value: Record<string, unknown>) {
        filters.push((row) => {
          const cell = row[col];
          if (!cell || typeof cell !== "object") return false;
          return Object.entries(value).every(([key, item]) => (cell as Record<string, unknown>)[key] === item);
        });
        return api;
      },
      limit(n: number) {
        limitN = n;
        return api;
      },
      maybeSingle: async () => ({ data: matched()[0] || null, error: null }),
      upsert: async (row: Record<string, unknown>) => {
        const list = rows();
        const index = list.findIndex((item) => {
          if (row.cache_key) return item.cache_key === row.cache_key;
          return item.name_key === row.name_key && item.city_key === row.city_key;
        });
        if (index >= 0) list[index] = { ...list[index], ...row };
        else list.push({ id: `id-${list.length + 1}`, ...row });
        return { error: null };
      },
      update(values: Record<string, unknown>) {
        return {
          eq(col: string, val: unknown) {
            filters.push((row) => row[col] === val);
            updates.push({ table, values });
            for (const row of matched()) Object.assign(row, values);
            return { error: null };
          },
        };
      },
      then(resolve: (value: unknown) => void) {
        resolve({ data: matched(), error: null });
      },
    };
    return api;
  }
  return {
    from,
    storage: {
      from() {
        return {
          upload: async (path: string) => {
            uploads.push(path);
            return { error: null };
          },
        };
      },
    },
    uploads,
    updates,
    tables,
  };
}

function card(details: Record<string, unknown>, extra?: Record<string, unknown>) {
  return {
    id: "carte-1",
    kind: "hotel",
    title: "Ritz",
    supplier: null,
    lifecycle: "active",
    details,
    ...extra,
  };
}

const fullProfile = {
  id: "fiche-1",
  name_key: "ritz",
  city_key: "paris",
  hotel_name: "Ritz",
  city: "Paris",
  country: "France",
  address: "15 Place Vendôme, 75001 Paris",
  website: "https://www.ritzparis.com/",
  phone: "+33142603830",
  description: DESCRIPTION,
  check_in_time: "15:00",
  check_out_time: "12:00",
  contacts: {
    reception: { email: "desk@ritzparis.com", phone: "+33142603830", email_status: "a_verifier" },
    reservations: { email: "reservations@ritzparis.com", phone: null, email_status: "a_verifier" },
    concierge: { email: null, phone: "+33143163070", email_status: null },
  },
  photos: [{ path: "ritz-paris/a.jpg", url: "https://proj.supabase.co/storage/v1/object/public/hotel-photos/ritz-paris/a.jpg", caption: "Façade" }],
  sources: ["https://www.ritzparis.com/fr"],
  citations: ["https://www.ritzparis.com/fr"],
  status: "auto",
  attempts: 1,
  searched_at: "2026-11-18T00:00:00.000Z",
  last_searched_at: "2026-11-18T00:00:00.000Z",
  last_verified_at: null,
};

test("la fiche complète est lue avant Perplexity et ne change pas la visibilité", async () => {
  const admin = memoryAdmin({
    crm_booking_items: [card({ hotel_name: "Ritz", city: "Paris", visible_to_client: true, client_hidden: false })],
    crm_hotel_profiles: [fullProfile],
    crm_le_hotels: [],
  });
  let called = false;
  const result = await runHotelEnrichment(admin as unknown as SupabaseClient, "carte-1", {
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(called, false);
  assert.equal(result.depuis_fiche, true);
  assert.equal(result.fiche?.statut, "auto");
  assert.equal(result.fiche?.adresse, "15 Place Vendôme, 75001 Paris");
  const saved = admin.tables.crm_booking_items[0].details as Record<string, unknown>;
  assert.equal(saved.address, "15 Place Vendôme, 75001 Paris");
  assert.equal(saved.description, DESCRIPTION);
  assert.equal(saved.visible_to_client, true);
  assert.equal(saved.client_hidden, false);
  assert.equal(saved.needs_review, true);
  assert.equal(admin.updates.every((update) => !("visible_to_client" in update.values)), true);
  assert.ok(result.rempli.includes("adresse"));
  assert.ok(!result.rempli.includes("photos") || Array.isArray(saved.photos));
});

test("une recherche stocke la photo officielle et laisse l’adresse déjà écrite", async () => {
  const admin = memoryAdmin({
    crm_booking_items: [card({ hotel_name: "Ritz", city: "Paris", address: "15 Place Vendôme, 75001 Paris" })],
    crm_hotel_profiles: [],
    crm_le_hotels: [],
    crm_hotel_web_profiles: [],
  });
  const result = await runHotelEnrichment(admin as unknown as SupabaseClient, "carte-1", {
    env: { PERPLEXITY_API_KEY: "test", NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co" },
    fetchImpl: async (input) => {
      if (String(input).includes("perplexity")) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    address: "1 Rue Autre, 75002 Paris",
                    website: "https://www.ritzparis.com/",
                    description: DESCRIPTION,
                    check_in: "15:00",
                    check_out: "12:00",
                    reception: { phone: "+33142603830", email: "desk@ritzparis.com" },
                    reservations: { phone: null, email: "reservations@ritzparis.com" },
                    concierge: { phone: "+33143163070", email: null },
                    photos: [],
                    sources: ["https://www.ritzparis.com/fr"],
                  }),
                },
              },
            ],
            images: [
              { image_url: "https://www.ritzparis.com/media/facade.jpg" },
              { image_url: "https://images.unsplash.com/photo.jpg" },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(jpeg(), { status: 200 });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(admin.uploads.length, 1);
  const saved = admin.tables.crm_booking_items[0].details as Record<string, unknown>;
  assert.equal(saved.address, "15 Place Vendôme, 75001 Paris");
  const photos = saved.photos as { url: string }[];
  assert.equal(photos.length, 1);
  assert.match(photos[0].url, /hotel-photos/);
  assert.equal(photos.some((photo) => photo.url.includes("unsplash")), false);
  const fiche = admin.tables.crm_hotel_profiles[0];
  assert.equal(fiche.status, "auto");
  const contacts = fiche.contacts as { reception: { email_status: string } };
  assert.equal(contacts.reception.email_status, "a_verifier");
  assert.equal(result.fiche?.contacts.reception.email, "desk@ritzparis.com");
});

test("le fournisseur Little Emperors ne suffit pas, le catalogue oui", async () => {
  const supplier = memoryAdmin({
    crm_booking_items: [
      card(
        { hotel_name: "St. Regis Dubai", city: "Dubai" },
        { title: "St. Regis Dubai", supplier: "Little Emperors" }
      ),
    ],
    crm_le_hotels: [],
    crm_hotel_profiles: [],
    crm_hotel_web_profiles: [],
  });
  let called = false;
  await runHotelEnrichment(supplier as unknown as SupabaseClient, "carte-1", {
    env: { PERPLEXITY_API_KEY: "test" },
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 500 });
    },
  });
  assert.equal(called, true);

  const catalog = memoryAdmin({
    crm_booking_items: [
      card({ hotel_name: "Hotel Viu Milan", city: "Milan" }, { title: "Hotel Viu Milan", supplier: "Little Emperors" }),
    ],
    crm_le_hotels: [{ hotel_name: "Hotel Viu Milan", city: "Milan", le_hotel_id: 9 }],
  });
  let catalogCalled = false;
  const ignored = await runHotelEnrichment(catalog as unknown as SupabaseClient, "carte-1", {
    env: { PERPLEXITY_API_KEY: "test" },
    fetchImpl: async () => {
      catalogCalled = true;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(ignored.statut, "ignore");
  assert.equal(catalogCalled, false);

  const linked = memoryAdmin({
    crm_booking_items: [card({ hotel_name: "Park Hyatt", city: "Phu Quoc", le_hotel_id: 44 })],
    crm_le_hotels: [],
  });
  const byId = await runHotelEnrichment(linked as unknown as SupabaseClient, "carte-1", {
    fetchImpl: async () => {
      throw new Error("perplexity");
    },
  });
  assert.equal(byId.statut, "ignore");
});

test("valider la fiche ne publie pas la carte et ne prépare aucun envoi", async () => {
  const admin = memoryAdmin({
    crm_booking_items: [
      card({
        hotel_name: "Ritz",
        city: "Paris",
        visible_to_client: false,
        needs_review: true,
        review_reason: "Infos hôtel trouvées par recherche web",
      }),
    ],
    crm_hotel_profiles: [fullProfile],
  });
  const result = await validerFicheHotel(admin as unknown as SupabaseClient, "carte-1");
  assert.equal(result.ok, true);
  assert.match(result.message, /Aucun message/);
  assert.match(result.message, /visibilité/);
  assert.equal(result.fiche?.statut, "verified");
  assert.equal(result.fiche?.contacts.reception.email_status, "verifie");
  const saved = admin.tables.crm_booking_items[0].details as Record<string, unknown>;
  assert.equal(saved.visible_to_client, false);
  assert.equal(saved.hotel_profile_status, "verified");
  assert.equal("needs_review" in saved, false);
  assert.equal("review_reason" in saved, false);
  assert.equal(admin.updates.every((update) => update.values.visible_to_client === undefined && "details" in update.values), true);
});

test("le plan de rattrapage dédoublonne et écarte Little Emperors", () => {
  const plan = planHotelBackfill(
    [
      { id: "a", kind: "hotel", title: "St. Regis Dubai", supplier: "Little Emperors", lifecycle: "active", details: { hotel_name: "St. Regis Dubai", city: "Dubai", address: "1 Sheikh Mohammed bin Rashid Blvd, Dubai" } },
      { id: "b", kind: "hotel", title: "St. Regis Dubai", supplier: "Expedia", lifecycle: "active", details: { hotel_name: "St. Regis Dubai", city: "Dubai", address: "1 Sheikh Mohammed bin Rashid Blvd, Dubai" } },
      { id: "c", kind: "hotel", title: "Hotel Viu Milan", lifecycle: "active", details: { hotel_name: "Hotel Viu Milan", city: "Milan" } },
      { id: "d", kind: "hotel", title: "Park Hyatt", lifecycle: "active", details: { hotel_name: "Park Hyatt", city: "Phu Quoc", le_hotel_id: 8 } },
      { id: "e", kind: "hotel", title: "Mondrian", lifecycle: "cancelled", details: { hotel_name: "Mondrian", city: "Bordeaux" } },
    ],
    [{ hotel_name: "Hotel Viu Milan", city: "Milan" }]
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0].name, "St. Regis Dubai");
  assert.deepEqual(plan[0].ids, ["a", "b"]);
  assert.ok(plan[0].gaps.includes("site"));
  assert.ok(!plan[0].gaps.includes("adresse"));
});

test("une fiche vérifiée ne remplace pas un e-mail, un e-mail nouveau reste à vérifier", () => {
  const current = {
    id: "1",
    name_key: "ritz",
    city_key: "paris",
    hotel_name: "Ritz",
    city: "Paris",
    country: "France",
    address: "15 Place Vendôme, 75001 Paris",
    website: "https://www.ritzparis.com/",
    description: DESCRIPTION,
    check_in_time: "15:00",
    check_out_time: "12:00",
    contacts: {
      reception: { email: "desk@ritzparis.com", phone: null, email_status: "verifie" as const },
      reservations: { email: null, phone: null, email_status: null },
      concierge: { email: null, phone: null, email_status: null },
    },
    photos: [],
    sources: [],
    status: "verified" as const,
    attempts: 1,
    last_searched_at: null,
    last_verified_at: "2026-11-01T00:00:00.000Z",
  } satisfies HotelProfile;
  const facts = emptyHotelWebFacts();
  facts.reception = { email: "autre@ritzparis.com", phone: "+33142603830" };
  facts.reservations = { email: "reservations@ritzparis.com", phone: null };
  const next = mergeHotelProfile(current, facts, { name: "Ritz", city: "Paris", searched: true });
  assert.equal(next.contacts.reception.email, "desk@ritzparis.com");
  assert.equal(next.contacts.reception.email_status, "verifie");
  assert.equal(next.contacts.reservations.email, "reservations@ritzparis.com");
  assert.equal(next.contacts.reservations.email_status, "a_verifier");
  assert.equal(next.status, "auto");
  const verified = verifyHotelProfile(next);
  assert.equal(verified.status, "verified");
  assert.equal(verified.contacts.reservations.email_status, "verifie");
  assert.equal(sniffHotelImage(jpeg())?.type, "image/jpeg");
  assert.equal(sniffHotelImage(new Uint8Array([0x3c, 0x73, 0x76, 0x67])), null);
});
