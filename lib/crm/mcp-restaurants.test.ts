import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRestaurantTool, listRestaurantsTool, updateRestaurantTool } from "./mcp-restaurants";
import { normalizeCatalog, parseRestaurantStatus, selectionBlock } from "./restaurants";
import { RESTAURANT_FICHE_MIGRATION } from "./restaurants-db";

const FICHE_COLUMNS = ["cuisine", "style", "price_estimated", "opening_hours", "online_cancellation", "availability_notes"];

type Row = Record<string, unknown>;

/** Table crm_restaurants en mémoire. `legacy` : base sans la migration fiche (colonnes et statut à valider absents). */
function fakeDb(options: { legacy?: boolean } = {}) {
  const rows: Row[] = [];
  let seq = 0;
  const statuses = options.legacy ? ["actif", "exclu"] : ["actif", "a_valider", "exclu"];
  function reject(payload: Row) {
    if (options.legacy && Object.keys(payload).some((key) => FICHE_COLUMNS.includes(key))) {
      return { code: "PGRST204", message: "column not found" };
    }
    if (payload.status !== undefined && !statuses.includes(String(payload.status))) {
      return { code: "23514", message: "check constraint" };
    }
    return null;
  }
  function from(table: string) {
    assert.equal(table, "crm_restaurants");
    const state = { op: "select" as "select" | "insert" | "update", payload: null as Row | null, filters: [] as [string, unknown][] };
    const run = () => {
      const matched = rows.filter((row) => state.filters.every(([column, value]) => row[column] === value));
      if (state.op === "insert") {
        const error = reject(state.payload || {});
        if (error) return { data: null, error };
        seq += 1;
        const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
        rows.push({ id, ...state.payload });
        return { data: [{ id }], error: null };
      }
      if (state.op === "update") {
        const error = reject(state.payload || {});
        if (error) return { data: null, error };
        for (const row of matched) Object.assign(row, state.payload);
        return { data: matched.map((row) => ({ id: row.id })), error: null };
      }
      return { data: matched.map((row) => ({ ...row })), error: null };
    };
    const builder = {
      select() {
        return builder;
      },
      insert(payload: Row) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload: Row) {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push([column, value]);
        return builder;
      },
      or() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle: async () => {
        const result = run();
        return { data: result.data?.[0] ?? null, error: result.error };
      },
      single: async () => {
        const result = run();
        return { data: result.data?.[0] ?? null, error: result.error };
      },
      then(resolve: (value: ReturnType<typeof run>) => unknown, rejectFn?: (reason: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, rejectFn);
      },
    };
    return builder;
  }
  return { client: { from } as unknown as SupabaseClient, rows };
}

const OSTUNI = {
  nom: "Ostuni",
  ville: "Milan",
  adresse: "Via Solferino 12",
  categories: "italien, pizzeria",
  cuisine: "italienne du sud",
  style: "trattoria",
  fourchette: "60 à 90 €",
  estimation: true,
  horaires: "12 h–14 h 30, 19 h 30–23 h",
  fermeture_jours: "lundi",
  plateforme: "thefork",
  lien: "https://thefork.example/ostuni",
  empreinte_carte: true,
  annulation_en_ligne: "non",
  annulation_heures: 24,
  site: "https://ostuni.example",
  disponibilites: "Réserver trois jours avant. Terrasse l’été.",
};

test("create_restaurant : fiche à valider par défaut, champs enregistrés, champs manquants nommés", async () => {
  const { client, rows } = fakeDb();
  const created = await createRestaurantTool(OSTUNI, client);
  assert.equal(created.cree, true);
  assert.equal(created.statut, "a_valider");
  assert.equal(created.statut_libelle, "À valider");
  assert.equal(created.selection, "Fiche à valider, hors sélection.");
  assert.equal(created.categorie, "italien");
  assert.deepEqual(created.categories, ["italien", "pizzeria"]);
  assert.equal(created.cuisine, "italienne du sud");
  assert.equal(created.style, "trattoria");
  assert.equal(created.estimation, true);
  assert.equal(created.horaires, "12 h–14 h 30, 19 h 30–23 h");
  assert.deepEqual(created.fermeture_jours, [1]);
  assert.equal(created.empreinte_carte, true);
  assert.equal(created.annulation_en_ligne, false);
  assert.equal(created.annulation_heures, 24);
  assert.equal(created.disponibilites, "Réserver trois jours avant. Terrasse l’été.");
  assert.equal(created.fiche_complete, false);
  assert.deepEqual(created.champs_manquants, ["photo de la salle", "photo du plat", "description"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "a_valider");
  assert.equal(rows[0].city_key, "milan");
  assert.equal(rows[0].guarantee_card, true);
  assert.equal(rows[0].online_cancellation, false);
  assert.equal(rows[0].price_estimated, true);
});

test("create_restaurant refuse un doublon dans la même ville, sauf forcer", async () => {
  const { client, rows } = fakeDb();
  const first = await createRestaurantTool(OSTUNI, client);
  await assert.rejects(
    () => createRestaurantTool({ nom: "OSTUNI", ville: "Milano" }, client),
    (error: Error) => error.message.includes(first.restaurant_id) && /update_restaurant/.test(error.message)
  );
  assert.equal(rows.length, 1);
  await createRestaurantTool({ nom: "Ostuni", ville: "Rome" }, client);
  await createRestaurantTool({ nom: "Ostuni", ville: "Milan", forcer: true, adresse: "Autre adresse" }, client);
  assert.equal(rows.length, 3);
  await assert.rejects(() => createRestaurantTool({ ville: "Milan" }, client), /Indiquez le nom/);
  await assert.rejects(() => createRestaurantTool({ nom: "Sans ville" }, client), /Indiquez la ville/);
});

test("list_restaurants filtre par ville et compte les fiches complètes et à valider", async () => {
  const { client } = fakeDb();
  await createRestaurantTool(OSTUNI, client);
  await createRestaurantTool({ nom: "Da Vittorio", ville: "Milano", statut: "actif" }, client);
  await createRestaurantTool({ nom: "Septime", ville: "Paris" }, client);
  const milan = await listRestaurantsTool({ ville: "Milan" }, client);
  assert.equal(milan.ville, "Milan");
  assert.equal(milan.total, 2);
  assert.equal(milan.a_valider, 1);
  assert.equal(milan.completes, 0);
  assert.deepEqual(milan.restaurants.map((row) => row.nom).sort(), ["Da Vittorio", "Ostuni"]);
  const pending = await listRestaurantsTool({ ville: "Milan", statut: "à valider" }, client);
  assert.deepEqual(pending.restaurants.map((row) => row.nom), ["Ostuni"]);
  const all = await listRestaurantsTool({}, client);
  assert.equal(all.total, 3);
  const one = await listRestaurantsTool({ restaurant_id: milan.restaurants[0].restaurant_id }, client);
  assert.equal(one.restaurant_id, milan.restaurants[0].restaurant_id);
  await assert.rejects(() => listRestaurantsTool({ restaurant_id: "nimp" }, client), /Restaurant invalide/);
  await assert.rejects(() => listRestaurantsTool({ ville: "Milan", statut: "ouvert" }, client), /Statut/);
});

test("update_restaurant ne change que les champs donnés et rend la fiche complète puis active", async () => {
  const { client, rows } = fakeDb();
  const created = await createRestaurantTool(OSTUNI, client);
  const untouched = await updateRestaurantTool({ restaurant_id: created.restaurant_id }, client);
  assert.equal(untouched.modifie, false);
  const completed = await updateRestaurantTool(
    {
      restaurant_id: created.restaurant_id,
      photos: "https://img.example/salle.jpg",
      photo_plat: "https://img.example/plat.jpg",
      description: "Une salle calme, lumière basse.",
      page: "https://maps.example/ostuni",
    },
    client
  );
  assert.equal(completed.modifie, true);
  assert.deepEqual(completed.champs, ["photos", "photo_plat", "description", "page"]);
  assert.equal(completed.fiche_complete, true);
  assert.deepEqual(completed.champs_manquants, []);
  assert.equal(completed.cuisine, "italienne du sud", "les champs non cités ne bougent pas");
  assert.equal(completed.statut, "a_valider");
  const active = await updateRestaurantTool({ restaurant_id: created.restaurant_id, statut: "actif" }, client);
  assert.equal(active.statut, "actif");
  assert.equal(active.selection, null);
  const excluded = await updateRestaurantTool({ restaurant_id: created.restaurant_id, statut: "exclu", motif: "ferme" }, client);
  assert.equal(excluded.statut, "exclu");
  assert.equal(excluded.selection, "Fermé, hors sélection.");
  assert.equal(rows.length, 1);
  await assert.rejects(() => updateRestaurantTool({ nom: "Sans identifiant" }, client), /restaurant_id/);
  await assert.rejects(() => updateRestaurantTool({ restaurant_id: "00000000-0000-4000-8000-999999999999", nom: "X" }, client), /introuvable/);
});

test("étoilé ou prépaiement : la fiche sort de la sélection quoi qu’on demande", async () => {
  const { client } = fakeDb();
  const starred = await createRestaurantTool({ nom: "Étoilé", ville: "Paris", etoile: true, statut: "actif" }, client);
  assert.equal(starred.statut, "exclu");
  assert.equal(starred.motif, "gastronomique");
  assert.equal(starred.selection, "Gastronomique ou étoilé, hors sélection.");
  const prepaid = await createRestaurantTool({ nom: "Prépayé", ville: "Paris", prepaiement: "oui", statut: "actif" }, client);
  assert.equal(prepaid.selection, "Prépaiement obligatoire, hors sélection.");
});

test("sans la migration fiche, l’outil nomme la migration au lieu d’écrire à moitié", async () => {
  const { client, rows } = fakeDb({ legacy: true });
  await assert.rejects(() => createRestaurantTool(OSTUNI, client), new RegExp(RESTAURANT_FICHE_MIGRATION));
  await assert.rejects(
    () => createRestaurantTool({ nom: "Ostuni", ville: "Milan", statut: "actif", cuisine: "italienne" }, client),
    new RegExp(RESTAURANT_FICHE_MIGRATION)
  );
  assert.equal(rows.length, 0);
  const legacy = await createRestaurantTool({ nom: "Ostuni", ville: "Milan", statut: "actif", fourchette: "60 €" }, client);
  assert.equal(legacy.statut, "actif");
  assert.equal(legacy.cuisine, "");
  assert.equal(rows.length, 1);
  assert.equal("cuisine" in rows[0], false);
  assert.equal(rows[0].price_band, "60 €");
});

test("le statut et les champs de fiche se lisent dans les deux langues", () => {
  assert.equal(parseRestaurantStatus("à valider"), "a_valider");
  assert.equal(parseRestaurantStatus("a_valider"), "a_valider");
  assert.equal(parseRestaurantStatus("Actif"), "actif");
  assert.equal(parseRestaurantStatus("exclu"), "exclu");
  assert.equal(parseRestaurantStatus(""), "actif");
  assert.deepEqual(parseRestaurantStatus("ouvert"), { error: "Statut : actif, a_valider ou exclu." });
  const draft = normalizeCatalog({
    name: "Septime",
    city: "Paris",
    opening_hours: "19 h–22 h",
    online_cancellation: true,
    price_estimated: "oui",
    availability_notes: "Complet un mois avant. Carte 4242 4242 4242 4242 à ne pas garder.",
    status: "a_valider",
  });
  assert.ok(!("error" in draft));
  if ("error" in draft) return;
  assert.equal(draft.openingHours, "19 h–22 h");
  assert.equal(draft.onlineCancellation, true);
  assert.equal(draft.priceEstimated, true);
  assert.equal(draft.status, "a_valider");
  assert.doesNotMatch(draft.availabilityNotes, /4242 4242 4242 4242/);
  assert.equal(selectionBlock({ ...draft }), "Fiche à valider, hors sélection.");
  const kept = normalizeCatalog({ name: "Septime", city: "Paris" }, draft);
  assert.ok(!("error" in kept));
  if ("error" in kept) return;
  assert.equal(kept.openingHours, "19 h–22 h", "une mise à jour partielle garde les champs de fiche");
  assert.equal(kept.status, "a_valider");
});
