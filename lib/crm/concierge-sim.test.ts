import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  GRADE_CRITERIA,
  SCENARIO_PHASES,
  confirmsRefusedAct,
  gradeTurn,
  plannedWrite,
  type GradeInput,
  type GradeCriterion,
} from "@/lib/crm/concierge-grader";
import { runScenario } from "@/lib/crm/concierge-sim";
import { CONCIERGE_EDGES, CONCIERGE_NEARBY, CONCIERGE_SCENARIOS, SCENARIO_NOW, scenarioRecords } from "@/lib/crm/concierge-scenarios.fixture";
import { buildConciergeDossier, replyOverCap, type ConciergeDossier } from "@/lib/crm/whatsapp-concierge";

const NOW = new Date("2026-06-01T08:00:00.000Z");

function bare(overrides: Partial<ConciergeDossier> = {}): ConciergeDossier {
  return {
    firstName: "Camille",
    preferences: [],
    language: "fr",
    stays: [],
    documents: [],
    movements: [],
    balances: [],
    ...overrides,
  };
}

function grade(overrides: Partial<GradeInput> & Pick<GradeInput, "message" | "reply" | "expect">) {
  return gradeTurn({
    phase: "sejour",
    handoff: null,
    tools: [],
    access: false,
    dossier: bare(),
    history: [],
    now: NOW,
    ...overrides,
  });
}

function criterion(scores: ReturnType<typeof gradeTurn>, name: GradeCriterion) {
  const found = scores.find((score) => score.criterion === name);
  assert.ok(found, name);
  return found;
}

test("les neuf phases ont au moins un scénario", () => {
  for (const phase of SCENARIO_PHASES) {
    assert.ok(CONCIERGE_SCENARIOS.some((row) => row.phase === phase), phase);
  }
  assert.equal(new Set(CONCIERGE_SCENARIOS.map((row) => row.phase)).size, SCENARIO_PHASES.length);
});

test("chaque critère a un cas qui passe et un cas qui échoue", () => {
  const pass = grade({
    message: "Bonjour",
    reply: "Votre séjour à Rome est confirmé.",
    expect: { handoff: null, lang: "fr", tools: [], write: null },
  });
  const failLang = grade({
    message: "Bonjour",
    reply: "Your flight leaves tomorrow.",
    expect: { handoff: null, lang: "fr" },
  });
  const failTu = grade({
    message: "Bonjour",
    reply: "Tu pars demain matin.",
    expect: { handoff: null, lang: "fr" },
  });
  const failLong = grade({
    message: "Bonjour",
    reply: "Une.\nDeux.\nTrois.\nQuatre.",
    expect: { handoff: null },
  });
  const failRobot = grade({
    message: "Bonjour",
    reply: "Séjour — Rome — hôtel",
    expect: { handoff: null },
  });
  const dossier = buildConciergeDossier({
    firstName: "Camille",
    bookings: [
      {
        id: "stay-rome",
        reference: "TB-2026-8801",
        title: "Rome",
        destination: "Rome",
        start_date: "2026-12-04",
        end_date: "2026-12-08",
        currency: "EUR",
        total_amount: 0,
        visible_to_client: true,
        prices_visible: false,
        cover_image_path: null,
        notes_client: null,
        share_code: null,
      },
      {
        id: "stay-nice",
        reference: "TB-2026-8802",
        title: "Nice",
        destination: "Nice",
        start_date: "2026-07-01",
        end_date: "2026-07-04",
        currency: "EUR",
        total_amount: 0,
        visible_to_client: true,
        prices_visible: false,
        cover_image_path: null,
        notes_client: null,
        share_code: null,
      },
    ],
    items: [
      {
        id: "past",
        booking_id: "stay-nice",
        kind: "flight",
        title: "Nice",
        start_at: "2026-05-01T09:00:00",
        end_at: "2026-05-01T10:00:00",
        amount: null,
        visible_to_client: true,
        details: { flight_number: "AF9999", city_from: "Paris", city_to: "Nice", from: "CDG", to: "NCE" },
      },
    ],
  });
  const failFact = grade({
    message: "À quelle heure ?",
    reply: "Votre vol décolle à 23h59.",
    dossier,
    expect: { handoff: null },
  });
  const failCity = grade({
    message: "Mon séjour à Nice",
    reply: "Vous êtes à Rome pour ce séjour.",
    dossier,
    expect: { handoff: null },
  });
  const failPast = grade({
    message: "Quel est mon vol ?",
    reply: "Votre vol est AF9999.",
    dossier,
    now: new Date("2026-06-01T08:00:00.000Z"),
    expect: { handoff: null },
  });
  const failPan = grade({
    message: "Bonjour",
    reply: "La carte est 4242424242424242.",
    expect: { handoff: null },
  });
  const failHandoff = grade({
    message: "Annulez mon séjour",
    reply: "Je transmets à l’agence.",
    handoff: null,
    expect: { handoff: "cancel" },
  });
  const failPromise = grade({
    message: "Bonjour",
    reply: "Je transmets à l’agence.",
    handoff: null,
    expect: { handoff: null },
  });
  const failTools = grade({
    message: "Où en est mon ESTA ?",
    reply: "Votre ESTA est approuvée.",
    tools: [],
    expect: { handoff: null, tools: ["lire_autorisation"] },
  });
  const failEsta = grade({
    message: "Vérifiez mon ESTA",
    reply: "Je lance le contrôle.",
    tools: ["verifier_esta"],
    dossier: bare(),
    expect: { handoff: null },
  });
  const passEsta = grade({
    message: "Vérifiez mon ESTA",
    reply: "Je lance le contrôle.",
    tools: ["verifier_esta"],
    dossier: bare({
      authorizations: [
        {
          bookingId: "stay-rome",
          travelerId: "trav-camille",
          traveler: "Camille Martin",
          kind: "esta",
          status: "a_verifier",
          validUntil: null,
          checkedAt: null,
        },
      ],
    }),
    expect: { handoff: null },
  });
  const failWrite = grade({
    message: "Ajoutez mon téléphone 06 12 34 56 78",
    reply: "C’est noté.",
    expect: { handoff: null, write: null },
  });
  const passWrite = grade({
    message: "Ajoutez mon téléphone 06 12 34 56 78",
    reply: "C’est noté.",
    expect: { handoff: null, write: { action: "contact", champs: ["telephone"] } },
  });
  const failBanned = grade({
    message: "Bonjour",
    reply: "Le prix net est réservé à l’agence.",
    expect: { handoff: null },
  });
  const failRefus = grade({
    phase: "refus",
    message: "Annulez mon séjour",
    reply: "J’ai annulé le séjour.",
    handoff: "cancel",
    expect: { handoff: "cancel" },
  });
  const passRefus = grade({
    phase: "refus",
    message: "Annulez mon séjour",
    reply: "Je transmets à l’agence.",
    handoff: "cancel",
    expect: { handoff: "cancel" },
  });

  const cases: Record<GradeCriterion, { pass: ReturnType<typeof gradeTurn>; fail: ReturnType<typeof gradeTurn> }> = {
    langue: { pass, fail: failLang },
    vouvoiement: { pass, fail: failTu },
    longueur: { pass, fail: failLong },
    robot: { pass, fail: failRobot },
    fait_hors_dossier: { pass, fail: failFact },
    ville: { pass, fail: failCity },
    segment_passe: { pass, fail: failPast },
    pan: { pass, fail: failPan },
    handoff: { pass, fail: failHandoff },
    promesse_agence: { pass, fail: failPromise },
    outils: { pass, fail: failTools },
    verifier_esta: { pass: passEsta, fail: failEsta },
    ecriture: { pass: passWrite, fail: failWrite },
    interdit: { pass, fail: failBanned },
    refus: { pass: passRefus, fail: failRefus },
  };

  for (const name of GRADE_CRITERIA) {
    assert.equal(criterion(cases[name].pass, name).ok, true, `${name} passe`);
    assert.equal(criterion(cases[name].fail, name).ok, false, `${name} échoue`);
  }
  assert.equal(confirmsRefusedAct("Je transmets à l’agence."), false);
  assert.equal(plannedWrite("Ajoutez mon téléphone 06 12 34 56 78")?.action, "contact");
});

test("le routeur joue les scénarios, et saute le tour qui attend le modèle", async () => {
  for (const scenario of CONCIERGE_SCENARIOS) {
    const run = await runScenario(scenario, { mode: "router", now: SCENARIO_NOW });
    assert.equal(run.ok, true, `${scenario.slug} ${run.summary}`);
    assert.equal(run.mode, "router");
  }
  const first = CONCIERGE_SCENARIOS[0];
  const run = await runScenario(first, { mode: "router", now: SCENARIO_NOW });
  const skipped = run.turns.find((turn) => turn.position === 3);
  assert.equal(skipped?.status, "skipped");
  assert.equal(run.turns.filter((turn) => turn.status === "graded").length, 2);
});

test("les écarts et les formulations proches passent", async () => {
  const rows = [...CONCIERGE_EDGES, ...CONCIERGE_NEARBY];
  for (const scenario of rows) {
    const run = await runScenario(scenario, { mode: "router", now: SCENARIO_NOW });
    assert.equal(run.ok, true, `${scenario.slug} ${run.summary} ${run.turns[0]?.reply}`);
  }
  const replyOf = async (slug: string) => {
    const scenario = rows.find((row) => row.slug === slug);
    assert.ok(scenario);
    const run = await runScenario(scenario, { mode: "router", now: SCENARIO_NOW });
    return run.turns[0]?.reply || "";
  };
  assert.match(await replyOf("retour-mal-formule"), /AF1205/);
  assert.match(await replyOf("retour-en"), /AF1205/);
  assert.match(await replyOf("terminal-vol"), /terminal est 2E/i);
  assert.match(await replyOf("terminal-en"), /terminal is 2E/i);
  assert.match(await replyOf("terminal-voisin"), /terminal est 1/i);
  assert.equal((await replyOf("petit-dejeuner")).includes("—"), false);
  assert.equal((await replyOf("petit-dejeuner")).includes("TB-"), false);
  assert.equal(replyOverCap(await replyOf("annulation-courte")), false);
});

test("le fixture se relit sans envoi", () => {
  const rows = scenarioRecords();
  assert.equal(rows.length, CONCIERGE_SCENARIOS.length);
  assert.equal(rows[0]?.turns[0]?.client_text.includes("vol"), true);
  const sources = [
    "lib/crm/concierge-grader.ts",
    "lib/crm/concierge-sim.ts",
    "lib/crm/concierge-scenarios.fixture.ts",
  ];
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("sendWhatsappSession"), false, file);
    assert.equal(source.includes("createServiceClient"), false, file);
    assert.equal(/from ["'][^"']*twilio/i.test(source), false, file);
  }
});
