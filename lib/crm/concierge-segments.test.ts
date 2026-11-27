import assert from "node:assert/strict";
import { test } from "node:test";
import { gradeTurn } from "@/lib/crm/concierge-grader";
import { clockInParis, segmentEtat } from "@/lib/crm/concierge-engine-dossier";
import { runConciergeEngine, simulateEngineReply } from "@/lib/crm/concierge-engine";
import { fixtureWebProvider } from "@/lib/crm/concierge-engine-web";
import { buildConciergeDossier, type ConciergeDossier } from "@/lib/crm/whatsapp-concierge";

const NOW = new Date("2026-11-27T08:00:00.000Z");

function stay(input: {
  id?: string;
  reference?: string;
  title?: string;
  destination?: string;
  start?: string;
  end?: string;
  items: Record<string, unknown>[];
  documents?: { id: string; booking_id: string; kind: string; file_name: string; visible_to_client: boolean }[];
}): ConciergeDossier {
  const id = input.id || "stay";
  return buildConciergeDossier({
    firstName: "Camille",
    language: "fr",
    bookings: [
      {
        id,
        reference: input.reference || "TB-2026-0229",
        title: input.title || "Dubaï",
        destination: input.destination || "Dubaï",
        start_date: input.start || "2026-11-15",
        end_date: input.end || "2026-11-20",
        currency: "EUR",
        total_amount: 0,
        visible_to_client: true,
        prices_visible: false,
        cover_image_path: null,
        notes_client: null,
        share_code: null,
      },
    ],
    items: input.items.map((item) => ({
      booking_id: id,
      amount: null,
      visible_to_client: true,
      supplier: null,
      ...item,
    })) as Parameters<typeof buildConciergeDossier>[0]["items"],
    bookingDocuments: input.documents || [],
  });
}

function flight(id: string, start: string, details: Record<string, unknown>, end?: string) {
  return {
    id,
    kind: "flight",
    title: `${details.city_from || ""} → ${details.city_to || ""}`,
    start_at: start,
    end_at: end || start,
    details,
  };
}

async function reply(message: string, dossier: ConciergeDossier, now = NOW, checkins?: { flightNumber: string; status: string; actor?: string }[]) {
  const result = await runConciergeEngine({
    message,
    dossier,
    now,
    checkins,
    generate: simulateEngineReply,
    web: fixtureWebProvider(),
  });
  return result;
}

test("un vol du matin est passé l’après-midi, à Paris", () => {
  assert.equal(segmentEtat("2026-11-27", "07h50", "Europe/Paris", NOW), "passe");
  assert.equal(segmentEtat("2026-11-27", "18h00", "Europe/Paris", NOW), "a_venir");
  assert.equal(clockInParis("2026-11-20", "07h50", "Asia/Dubai"), "04h50");
});

test("l’heure répond sur le prochain segment, avec la date absolue et les deux fuseaux", async () => {
  const dossier = stay({
    start: "2026-11-27",
    end: "2026-12-02",
    items: [
      flight("past", "2026-11-20T07:50:00", {
        flight_number: "EK76",
        city_from: "Dubaï",
        city_to: "Paris",
        from: "DXB",
        to: "CDG",
        terminal: "3",
        departure_timezone: "Asia/Dubai",
      }),
      flight("next", "2026-12-02T09:10:00", {
        flight_number: "AF1180",
        city_from: "Paris",
        city_to: "Rome",
        from: "CDG",
        to: "FCO",
        terminal: "2E",
        departure_timezone: "Europe/Paris",
      }),
    ],
  });
  const time = await reply("À quelle heure est mon vol ?", dossier);
  assert.match(time.reply, /AF1180/);
  assert.match(time.reply, /2 décembre 2026/);
  assert.match(time.reply, /09h10/);
  assert.match(time.reply, /Europe\/Paris/);
  assert.doesNotMatch(time.reply, /aujourd’hui|aujourd'hui|EK76|07h50/);
  const terminal = await reply("Quel est le terminal de mon vol ?", dossier);
  assert.match(terminal.reply, /2E/);
  assert.match(terminal.reply, /2 décembre 2026/);
  assert.doesNotMatch(terminal.reply, /\b3\b/);
  const sure = await reply("Vous êtes sûr ?", dossier, NOW);
  assert.match(sure.reply, /AF1180/);
  assert.doesNotMatch(sure.reply, /EK76/);
});

test("si tout est passé, on le dit, sans inventer aujourd’hui", async () => {
  const dossier = stay({
    items: [
      flight("back", "2026-11-20T07:50:00", {
        flight_number: "EK76",
        city_from: "Dubaï",
        city_to: "Paris",
        from: "DXB",
        to: "CDG",
        terminal: "3",
        departure_timezone: "Asia/Dubai",
      }),
    ],
  });
  const time = await reply("À quelle heure est mon vol retour ?", dossier);
  assert.match(time.reply, /déjà passés/i);
  assert.match(time.reply, /20 novembre 2026/);
  assert.match(time.reply, /07h50/);
  assert.match(time.reply, /04h50/);
  assert.match(time.reply, /Asia\/Dubai/);
  assert.doesNotMatch(time.reply, /aujourd’hui|aujourd'hui/);
  const terminal = await reply("Quel est le terminal ?", dossier);
  assert.match(terminal.reply, /déjà passés/i);
  assert.doesNotMatch(terminal.reply, /terminal 3|est 3/);
});

test("un retour daté avant l’aller est signalé sans être réinterprété", async () => {
  const dossier = stay({
    start: "2026-12-02",
    end: "2026-11-20",
    items: [
      flight("out", "2026-12-02T09:10:00", {
        flight_number: "AF1180",
        city_from: "Paris",
        city_to: "Dubaï",
        from: "CDG",
        to: "DXB",
        departure_timezone: "Europe/Paris",
      }),
      flight("back", "2026-11-20T07:50:00", {
        flight_number: "EK76",
        city_from: "Dubaï",
        city_to: "Paris",
        from: "DXB",
        to: "CDG",
        departure_timezone: "Asia/Dubai",
      }),
    ],
  });
  const time = await reply("À quelle heure est mon vol ?", dossier);
  assert.match(time.reply, /daté avant l’aller/);
  assert.match(time.reply, /20 novembre 2026/);
  assert.match(time.reply, /2 décembre 2026/);
  assert.doesNotMatch(time.reply, /erreur|invers|je corrige/i);
});

test("aujourd’hui n’est dit que si la date de Paris est celle du vol", async () => {
  const dossier = stay({
    start: "2026-11-27",
    end: "2026-11-28",
    title: "Rome",
    destination: "Rome",
    items: [
      flight("today", "2026-11-27T18:00:00", {
        flight_number: "AF1204",
        city_from: "Paris",
        city_to: "Rome",
        from: "CDG",
        to: "FCO",
        departure_timezone: "Europe/Paris",
      }),
    ],
  });
  const time = await reply("À quelle heure est mon vol ?", dossier);
  assert.match(time.reply, /aujourd’hui|aujourd'hui/);
  assert.match(time.reply, /27 novembre 2026/);
  assert.match(time.reply, /18h00/);
});

test("l’enregistrement ne promet que ce qui est noté", async () => {
  const dossier = stay({
    start: "2026-12-02",
    end: "2026-12-08",
    items: [
      flight("next", "2026-12-02T09:10:00", {
        flight_number: "AF1180",
        city_from: "Paris",
        city_to: "Rome",
        from: "CDG",
        to: "FCO",
        departure_timezone: "Europe/Paris",
      }),
    ],
  });
  const open = await reply("Tu pourras me faire le check-in ?", dossier);
  assert.match(open.reply, /sans engagement/);
  assert.match(open.reply, /à faire/);
  assert.match(open.reply, /pas encore ouverte|Fenêtre/i);
  assert.doesNotMatch(open.reply, /effectuera|s’occupe|s'occupe/);
  const done = await reply("Tu pourras me faire le check-in ?", dossier, NOW, [{ flightNumber: "AF1180", status: "fait" }]);
  assert.match(done.reply, /enregistrement fait/i);
  assert.doesNotMatch(done.reply, /effectuera|sans engagement/);
  const planned = await reply("Tu pourras me faire le check-in ?", dossier, NOW, [
    { flightNumber: "AF1180", status: "a_faire", actor: "agence" },
  ]);
  assert.match(planned.reply, /s’occupe|s'occupe/);
  const cards = stay({
    start: "2026-12-02",
    end: "2026-12-08",
    items: [
      flight("next", "2026-12-02T09:10:00", {
        flight_number: "AF1180",
        city_from: "Paris",
        city_to: "Rome",
        from: "CDG",
        to: "FCO",
        departure_timezone: "Europe/Paris",
      }),
    ],
    documents: [
      {
        id: "pass",
        booking_id: "stay",
        kind: "carte d'embarquement",
        file_name: "",
        visible_to_client: true,
      },
    ],
  });
  const deposited = await reply("Fais mon check-in", cards, NOW, [{ flightNumber: "AF1180", status: "cartes_recues" }]);
  assert.match(deposited.reply, /cartes d’embarquement reçues/i);
  assert.match(deposited.reply, /déposées/);
});

test("un restaurant propose des adresses puis l’agence, sans réserver", async () => {
  const dossier = stay({
    title: "Rome",
    destination: "Rome",
    start: "2026-12-04",
    end: "2026-12-08",
    items: [
      {
        id: "hotel",
        kind: "hotel",
        title: "Hotel de Rome",
        start_at: "2026-12-04T15:00:00",
        end_at: "2026-12-08T11:00:00",
        details: { hotel_name: "Hotel de Rome", city: "Rome" },
      },
    ],
  });
  const result = await reply("Vous pouvez réserver un restaurant ?", dossier);
  assert.match(result.reply, /Le Comptoir/);
  assert.match(result.reply, /Chez Marcel|La Table/);
  assert.match(result.reply, /Souhaitez-vous que je transmette/);
  assert.match(result.reply, /Rien n’est réservé|Rien n'est réservé/);
  assert.equal(result.tools.includes("recherche_web"), true);
  assert.doesNotMatch(result.reply, /j’ai réservé|j'ai réservé|prix net|fournisseur|Little Emperors/i);
});

test("le correcteur voit les heures du dossier et refuse une date relative fausse", () => {
  const dossier = stay({
    items: [
      flight("back", "2026-11-20T07:50:00", {
        flight_number: "EK76",
        city_from: "Dubaï",
        city_to: "Paris",
        from: "DXB",
        to: "CDG",
        terminal: "3",
        departure_timezone: "Asia/Dubai",
      }),
      flight("next", "2026-12-02T09:10:00", {
        flight_number: "AF1180",
        city_from: "Paris",
        city_to: "Rome",
        from: "CDG",
        to: "FCO",
        terminal: "2E",
        departure_timezone: "Europe/Paris",
      }),
    ],
  });
  const known = gradeTurn({
    phase: "vol",
    message: "À quelle heure est mon vol ?",
    reply: "Votre prochain vol AF1180 part le 2 décembre 2026 à 09h10, heure de Paris (Europe/Paris).",
    handoff: null,
    tools: ["lire_vols"],
    access: false,
    dossier,
    history: [],
    now: NOW,
    expect: { handoff: null },
  });
  assert.equal(known.find((row) => row.criterion === "fait_hors_dossier")?.ok, true);
  const paris = gradeTurn({
    phase: "vol",
    message: "À quelle heure est mon vol ?",
    reply: "Le vol EK76 partait à 07h50 heure locale, 04h50 heure de Paris.",
    handoff: null,
    tools: ["lire_vols"],
    access: false,
    dossier,
    history: [],
    now: NOW,
    expect: { handoff: null },
  });
  assert.equal(paris.find((row) => row.criterion === "fait_hors_dossier")?.ok, true);
  assert.equal(paris.find((row) => row.criterion === "segment_passe")?.ok, false);
  const relative = gradeTurn({
    phase: "vol",
    message: "À quelle heure est mon vol retour ?",
    reply: "Votre vol retour Dubaï–Paris est prévu aujourd’hui à 07h50.",
    handoff: null,
    tools: ["lire_vols"],
    access: false,
    dossier,
    history: [],
    now: NOW,
    expect: { handoff: null },
  });
  assert.equal(relative.find((row) => row.criterion === "segment_passe")?.detail, "date relative fausse");
  const gate = gradeTurn({
    phase: "aeroport",
    message: "Quel est le terminal de mon vol ?",
    reply: "Le terminal est 3.",
    handoff: null,
    tools: ["lire_vols"],
    access: false,
    dossier,
    history: [],
    now: NOW,
    expect: { handoff: null },
  });
  assert.equal(gate.find((row) => row.criterion === "segment_passe")?.ok, false);
  const honest = gradeTurn({
    phase: "vol",
    message: "Tu pourras me faire le check-in ?",
    reply: "L’enregistrement n’est pas renseigné. Je peux transmettre la demande à l’agence, sans engagement.",
    handoff: "question",
    tools: ["statut_checkin", "ouvrir_demande"],
    access: false,
    dossier,
    history: [],
    now: NOW,
    expect: { handoff: "question" },
  });
  assert.equal(honest.find((row) => row.criterion === "checkin")?.ok, true);
  const promised = gradeTurn({
    phase: "vol",
    message: "Tu pourras me faire le check-in ?",
    reply: "L’agence s’occupe de l’enregistrement.",
    handoff: "question",
    tools: ["statut_checkin"],
    access: false,
    dossier,
    history: [],
    now: NOW,
    checkins: [{ status: "a_faire", actor: "agence" }],
    expect: { handoff: "question" },
  });
  assert.equal(promised.find((row) => row.criterion === "checkin")?.ok, true);
  const table = gradeTurn({
    phase: "sejour",
    message: "Vous pouvez réserver un restaurant ?",
    reply: "Près de l’hôtel : Le Comptoir, Chez Marcel. Souhaitez-vous que je transmette la réservation à l’agence ?",
    handoff: null,
    tools: ["recherche_web"],
    access: false,
    dossier,
    history: [],
    now: NOW,
    expect: { handoff: null },
  });
  assert.equal(table.find((row) => row.criterion === "restaurant")?.ok, true);
});
