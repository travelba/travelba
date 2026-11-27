import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { clockInParis, normalizeDossier, sanitizeWebQuery, truncateHistory } from "@/lib/crm/concierge-engine-dossier";
import { CONCIERGE_ENGINE_SCENARIOS, SCENARIO_NOW } from "@/lib/crm/concierge-engine-scenarios";
import {
  conciergeEngineMode,
  filterEngineReply,
  recordConciergeShadow,
  runConciergeEngine,
  simulateEngineReply,
  type ShadowAdmin,
} from "@/lib/crm/concierge-engine";
import { fixtureWebProvider, prepareWebHits, publicHttps, type WebHit, type WebProvider } from "@/lib/crm/concierge-engine-web";
import { runScenario } from "@/lib/crm/concierge-sim";
import { buildConciergeDossier, type ConciergeDossier } from "@/lib/crm/whatsapp-concierge";

function bare(): ConciergeDossier {
  return { firstName: "Camille", preferences: [], language: "fr", stays: [], documents: [], movements: [], balances: [] };
}

test("le simulateur note les réponses des scénarios du moteur", async () => {
  assert.ok(CONCIERGE_ENGINE_SCENARIOS.length >= 11);
  for (const scenario of CONCIERGE_ENGINE_SCENARIOS) {
    const run = await runScenario(scenario, { mode: "engine", now: SCENARIO_NOW });
    assert.equal(run.ok, true, `${scenario.slug} ${run.summary} ${run.turns.map((turn) => turn.reply).join(" | ")}`);
    assert.equal(run.turns.every((turn) => turn.reply.trim().length > 0), true, scenario.slug);
  }
  const bySlug = async (slug: string) => {
    const scenario = CONCIERGE_ENGINE_SCENARIOS.find((row) => row.slug === slug);
    assert.ok(scenario);
    const run = await runScenario(scenario, { mode: "engine", now: SCENARIO_NOW });
    return run.turns.map((turn) => turn.reply).join("\n");
  };
  assert.match(await bySlug("tarif-paris-nice"), /n’est pas encore dans votre dossier/i);
  assert.doesNotMatch(await bySlug("tarif-paris-nice"), /solde/i);
  assert.match(await bySlug("heure-aeroport"), /règle générale/i);
  assert.match(await bySlug("heure-aeroport"), /10h30/);
  assert.match(await bySlug("visa-cancun"), /Mayakoba/);
  assert.match(await bySlug("visa-cancun"), /Mexique/);
  assert.match(await bySlug("check-in-agence"), /à faire/i);
  assert.match(await bySlug("check-in-agence"), /sans engagement/i);
  assert.doesNotMatch(await bySlug("check-in-agence"), /compagnie|effectuera|qui fait l’enregistrement/i);
  const room = await bySlug("chambre-tot-mexique");
  assert.match(room, /Mayakoba/);
  assert.match(await bySlug("cest-une-question"), /question/i);
  assert.match(await bySlug("web-visa-mexique"), /diplomatie\.gouv\.fr/);
  assert.match(await bySlug("web-meteo-cancun"), /meteofrance\.com/);
  assert.match(await bySlug("web-retard-af"), /AF1204/);
  assert.match(await bySlug("web-petit-dejeuner"), /7h00/);
  assert.match(await bySlug("web-greve"), /grève/i);
});

test("l’heure de Paris suit le fuseau du vol", () => {
  assert.equal(clockInParis("2026-12-04", "10h30", "Europe/Paris"), "10h30");
  assert.equal(clockInParis("2026-12-12", "17h00", "America/Cancun"), "23h00");
});

test("la requête web ne porte ni le nom ni la référence", () => {
  const clean = sanitizeWebQuery("visa Camille Martin TB-2026-8810 vol AF438 0612345678", ["Camille Martin", "Camille"]);
  assert.equal(clean.includes("Camille"), false);
  assert.equal(clean.includes("TB-"), false);
  assert.equal(clean.includes("0612"), false);
  assert.match(clean, /AF438/);
  assert.match(clean, /visa/);
});

test("le fil long garde l’ouverture et le dernier message", () => {
  const turns = Array.from({ length: 40 }, (_, index) => ({
    direction: "inbound" as const,
    body: index === 0 ? "On part au Mexique" : `message ${index}`,
    at: null,
  }));
  const cut = truncateHistory(turns);
  assert.ok(cut.length < turns.length);
  assert.equal(cut[0]?.body, "On part au Mexique");
  assert.equal(cut.at(-1)?.body, "message 39");
});

test("les comparateurs et les prix sortent de la recherche", () => {
  const hits: WebHit[] = [
    { title: "Booking 199 €", url: "https://www.booking.com/hotel", snippet: "Chambre à 199 €" },
    { title: "Conseil", url: "https://www.diplomatie.gouv.fr/mexique", snippet: "Pas de visa. Dès 40 €." },
    { title: "Interne", url: "http://exemple.test/page", snippet: "hors https" },
  ];
  const ready = prepareWebHits(hits);
  assert.equal(ready.length, 1);
  assert.match(ready[0].url, /diplomatie/);
  assert.equal(ready[0].snippet.includes("€"), false);
  assert.equal(publicHttps("http://diplomatie.gouv.fr/x"), null);
  assert.equal(publicHttps("https://127.0.0.1/x"), null);
  assert.equal(publicHttps("https://localhost/x"), null);
});

test("le filtre bloque une heure inventée, une commission et un prix net", () => {
  const dossier = bare();
  const invented = filterEngineReply({ text: "Votre vol part à 15h45.", dossier, history: [], corpus: "" });
  assert.equal(invented.blocked, true);
  assert.equal(invented.text.includes("15h45"), false);
  const commission = filterEngineReply({ text: "La commission est incluse.", dossier, history: [], corpus: "" });
  assert.equal(commission.blocked, true);
  const net = filterEngineReply({ text: "Le prix net est de 400 euros.", dossier, history: [], corpus: "Le prix net est de 400 euros." });
  assert.equal(net.blocked, true);
});

test("CONCIERGE_ENGINE reste l’ombre tant qu’il n’est pas coupé", () => {
  assert.equal(conciergeEngineMode({}), "shadow");
  assert.equal(conciergeEngineMode({ CONCIERGE_ENGINE: "live" }), "shadow");
  assert.equal(conciergeEngineMode({ CONCIERGE_ENGINE: "off" }), "off");
});

test("l’ombre enregistre la réponse et n’envoie rien", async () => {
  const inserted: Record<string, unknown>[] = [];
  const admin = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return { order: () => ({ limit: async () => ({ data: [], error: null }) }) };
            },
            in: async () => ({ data: table === "crm_flight_checkins" ? [{ booking_item_id: "fl", status: "a_faire" }] : [], error: null }),
          };
        },
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: null };
        },
      };
    },
  } as ShadowAdmin;
  const saved = await recordConciergeShadow(
    admin,
    async () => ({
      firstName: "Camille",
      bookings: [],
      items: [],
      travelers: [],
    }),
    {
      customerId: "cus-1",
      firstName: "Camille",
      phone: "+33601020304",
      messageId: "11111111-1111-1111-1111-111111111111",
      message: "à quelle heure à l'aéroport",
      now: SCENARIO_NOW,
      bookingIds: null,
    },
    { generate: simulateEngineReply, web: fixtureWebProvider() }
  );
  assert.equal(saved.stored, true);
  assert.equal("twilio_sid" in (inserted[0] || {}), false);
  const row = inserted[0];
  assert.equal(row.engine, "shadow");
  assert.equal(JSON.stringify(row).includes("passeport"), false);
  assert.equal("phone" in row, false);
  assert.equal("birth" in row, false);
  const missing = await recordConciergeShadow(
    {
      from: () => ({
        select: () => ({
          eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
          in: async () => ({ data: [], error: null }),
        }),
        insert: async () => ({ error: { code: "42P01", message: "relation crm_concierge_shadow does not exist" } }),
      }),
    } as ShadowAdmin,
    async () => ({ bookings: [], items: [] }),
    {
      customerId: "cus-1",
      firstName: "Camille",
      phone: "+33601020304",
      messageId: "not-a-uuid",
      message: "bonjour",
      now: SCENARIO_NOW,
      bookingIds: null,
    },
    { generate: simulateEngineReply, web: fixtureWebProvider() }
  );
  assert.equal(missing.stored, false);
  assert.equal(missing.skipped, "table absente");
});

test("une recherche ne reçoit pas le nom du client", async () => {
  const seen: string[] = [];
  const web: WebProvider = {
    name: "fixture",
    async search(query) {
      seen.push(query);
      return [{ title: "Conseil", url: "https://www.diplomatie.gouv.fr/mexique", snippet: "Pas de visa." }];
    },
    async read() {
      return null;
    },
  };
  const dossier = buildConciergeDossier({
    firstName: "Camille",
    bookings: [
      {
        id: "stay-maya",
        reference: "TB-2026-8810",
        title: "Mayakoba",
        destination: "Mayakoba",
        start_date: "2026-12-12",
        end_date: "2026-12-19",
        currency: "EUR",
        total_amount: 0,
        visible_to_client: true,
        prices_visible: false,
        cover_image_path: null,
        notes_client: null,
        share_code: null,
      },
    ],
  });
  await runConciergeEngine({
    message: "visa",
    dossier,
    now: SCENARIO_NOW,
    travelers: [{ bookingId: "stay-maya", firstName: "Camille", lastName: "Martin" }],
    web,
    generate: async ({ tools }) => {
      await tools.recherche_web("visa Camille Martin TB-2026-8810");
      return { text: "Règle générale : pas de visa." };
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].includes("Camille"), false);
  assert.equal(seen[0].includes("TB-"), false);
  assert.match(seen[0], /visa/);
});

test("le dossier normalisé ne contient ni passeport ni naissance", () => {
  const dossier = buildConciergeDossier({
    firstName: "Camille",
    bookings: [
      {
        id: "stay-maya",
        reference: "TB-2026-8810",
        title: "Mayakoba",
        destination: "Mayakoba",
        start_date: "2026-12-12",
        end_date: "2026-12-19",
        currency: "EUR",
        total_amount: 0,
        visible_to_client: true,
        prices_visible: false,
        cover_image_path: null,
        notes_client: null,
        share_code: null,
      },
    ],
    travelDocuments: [{ doc_type: "passport", first_name: "Camille", last_name: "Martin", expires_on: "2030-01-01", number: "12AB34567" }],
  });
  const view = normalizeDossier({
    dossier,
    message: "visa pour Cancun",
    now: SCENARIO_NOW,
    travelers: [{ bookingId: "stay-maya", firstName: "Camille", lastName: "Martin" }],
  });
  const blob = JSON.stringify(view);
  assert.equal(blob.includes("12AB34567"), false);
  assert.equal(blob.includes("2030-01-01"), false);
  assert.match(view.sejours[0]?.alias || "", /Mayakoba/);
  assert.equal(view.sejours[0]?.passagers[0], "Camille Martin");
});

test("le script manuel sort sans bloquer quand il est coupé", () => {
  const run = spawnSync(process.execPath, ["scripts/concierge-engine-eval.mjs"], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    encoding: "utf8",
    env: { ...process.env, CONCIERGE_ENGINE_EVAL: "" },
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /coupée/);
});

test("le moteur n’appelle pas Twilio", () => {
  const files = [
    "lib/crm/concierge-engine.ts",
    "lib/crm/concierge-engine-web.ts",
    "lib/crm/concierge-engine-dossier.ts",
    "lib/crm/concierge-engine-scenarios.ts",
    "scripts/concierge-engine-eval.mjs",
    "supabase/migrations/20261126103000_concierge_shadow.sql",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("sendWhatsappSession"), false, file);
    assert.equal(source.includes("passport_number"), false, file);
    assert.equal(source.includes("date_of_birth"), false, file);
  }
  const sql = readFileSync("supabase/migrations/20261126103000_concierge_shadow.sql", "utf8");
  assert.match(sql, /crm_concierge_shadow/);
  assert.match(sql, /Aucun envoi/);
});
