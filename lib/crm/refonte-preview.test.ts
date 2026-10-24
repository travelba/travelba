import assert from "node:assert/strict";
import test from "node:test";
import {
  arrivalNeedsPayment,
  buildRefonteModel,
  dossierFinance,
  dossierTab,
  fictiveAmounts,
  formalityValidated,
  maskPersonName,
  redactSensitive,
  refonteActiveHref,
  refonteColumn,
  refontePreviewEnabled,
  type RefonteBookingInput,
  type RefonteBuildInput,
} from "./refonte-preview";

const TODAY = "2026-10-24";

function booking(partial: Partial<RefonteBookingInput> & Pick<RefonteBookingInput, "id">): RefonteBookingInput {
  return {
    reference: partial.reference || partial.id.toUpperCase(),
    title: partial.title || "Séjour",
    destination: partial.destination || "Rome",
    customerId: partial.customerId || "c1",
    customer: partial.customer || "Camille D.",
    start: partial.start === undefined ? "2026-10-26" : partial.start,
    end: partial.end === undefined ? "2026-10-30" : partial.end,
    visible: partial.visible ?? false,
    archived: partial.archived ?? false,
    sale: partial.sale ?? 4200,
    currency: "EUR",
    updatedAt: partial.updatedAt || "2026-10-20",
    cardCount: partial.cardCount ?? 0,
    ...partial,
    id: partial.id,
  };
}

function emptyInput(bookings: RefonteBookingInput[]): RefonteBuildInput {
  return {
    bookings,
    travelers: [],
    items: [],
    checks: [],
    visas: [],
    arrivals: [],
    emails: [],
    mails: [],
    whatsapp: [],
    concierge: [],
    costs: [],
    balances: [],
  };
}

test("le drapeau est éteint en production et si REFONTE_PREVIEW=0", () => {
  assert.equal(refontePreviewEnabled({ VERCEL_ENV: "production" }), false);
  assert.equal(refontePreviewEnabled({ VERCEL_ENV: "preview", REFONTE_PREVIEW: "0" }), false);
  assert.equal(refontePreviewEnabled({ VERCEL_ENV: "preview" }), true);
  assert.equal(refontePreviewEnabled({}), true);
});

test("le menu à six entrées allume le bon chemin", () => {
  assert.equal(refonteActiveHref("/admin/preview/refonte"), "/admin/preview/refonte");
  assert.equal(refonteActiveHref("/admin/preview/refonte/dossiers"), "/admin/preview/refonte/dossiers");
  assert.equal(refonteActiveHref("/admin/preview/refonte/dossiers/abc"), "/admin/preview/refonte/dossiers");
  assert.equal(refonteActiveHref("/admin/preview/refonte/messages"), "/admin/preview/refonte/messages");
  assert.equal(refonteActiveHref("/admin"), null);
});

test("le nom devient prénom et initiale", () => {
  assert.equal(maskPersonName("camille", "durand"), "Camille D.");
  assert.equal(maskPersonName("  andréa ", "müller"), "Andréa M.");
  assert.equal(maskPersonName("", ""), "Client");
  assert.equal(maskPersonName("", "martin"), "M.");
});

test("le texte perd e-mail, carte, téléphone et nom, pas la date", () => {
  const text = redactSensitive(
    "Camille Durand part le 2026-10-24, carte 4111 1111 1111 1111, tel 06 12 34 56 78, mail camille.durand@agence.fr",
    { full: ["Camille Durand"], last: ["Durand"] }
  );
  assert.match(text, /Camille D\./);
  assert.doesNotMatch(text, /Durand/i);
  assert.doesNotMatch(text, /4111/);
  assert.doesNotMatch(text, /06 12/);
  assert.doesNotMatch(text, /@agence/);
  assert.match(text, /2026-10-24/);
  const mrz = redactSensitive("P<FRADURAND<<CAMILLE<<<<<<<<<<<<<<<<<<<");
  assert.equal(mrz, "••••");
});

test("les colonnes suivent préparation, visible, voyage, terminé, archivé", () => {
  assert.equal(refonteColumn(booking({ id: "a", start: "2026-11-02", visible: false }), TODAY), "preparation");
  assert.equal(refonteColumn(booking({ id: "b", start: "2026-11-02", visible: true }), TODAY), "visible");
  assert.equal(refonteColumn(booking({ id: "c", start: "2026-10-20", end: "2026-10-28", visible: true }), TODAY), "voyage");
  assert.equal(refonteColumn(booking({ id: "d", start: "2026-09-01", end: "2026-09-08", visible: true }), TODAY), "terminee");
  assert.equal(refonteColumn(booking({ id: "e", archived: true, visible: true }), TODAY), "archivee");
});

test("les tâches urgentes passent avant la boîte d’import", () => {
  const model = buildRefonteModel(
    {
      ...emptyInput([
        booking({ id: "soon", customer: "Camille D.", destination: "Rome", start: "2026-10-25", end: "2026-10-28" }),
        booking({ id: "later", customer: "Louis M.", destination: "Oslo", start: "2026-11-12", end: "2026-11-16", customerId: "c2" }),
      ]),
      travelers: [{ id: "t1", bookingId: "soon", label: "Camille D.", hasPassport: false }],
      checks: [{ id: "e1", bookingId: "later", travelerId: "t2", program: "ESTA", status: "a_verifier" }],
      arrivals: [{ id: "a1", bookingId: "later", itemTitle: "Hôtel", status: "link_received" }],
      items: [{ id: "h1", bookingId: "later", kind: "hotel", title: "Hôtel", start: "2026-11-12", end: "2026-11-16", confirmed: false, active: true }],
      emails: [{ id: "m1", at: "2026-10-24T08:00:00Z", label: "Little Emperors", preview: "Pièce", bookingId: null, waiting: true }],
      concierge: [{ id: "q1", at: "2026-10-24T09:00:00Z", customerId: "c2", bookingId: "later", label: "Devis" }],
    },
    TODAY
  );
  assert.equal(model.tasks[0]?.kind, "depart_document");
  assert.equal(model.tasks[0]?.action, "Demander la pièce");
  const kinds = model.tasks.map((row) => row.kind);
  assert.ok(kinds.indexOf("depart_document") < kinds.indexOf("formalite"));
  assert.ok(kinds.indexOf("formalite") < kinds.indexOf("paiement"));
  assert.ok(kinds.indexOf("concierge") < kinds.indexOf("email"));
  assert.equal(formalityValidated("approuve"), true);
  assert.equal(arrivalNeedsPayment("paid"), false);
  assert.equal(model.tasks.some((row) => /Durand|passeport \d|4111/.test(row.detail)), false);
});

test("la semaine pose départ, sur place et retour, avec un point", () => {
  const model = buildRefonteModel(
    emptyInput([
      booking({ id: "go", start: "2026-10-26", end: "2026-10-30", visible: true }),
      booking({ id: "here", start: "2026-10-20", end: "2026-10-28", visible: true, customerId: "c2", customer: "Louis M." }),
      booking({ id: "back", start: "2026-10-18", end: "2026-10-24", visible: true, customerId: "c3", customer: "Inès P.", destination: "Lisbonne" }),
    ]),
    TODAY
  );
  const flat = model.week.flatMap((day) => day.events.map((event) => `${day.day}:${event.kind}`));
  assert.ok(flat.includes("2026-10-26:depart"));
  assert.ok(flat.includes("2026-10-24:sur_place"));
  assert.ok(flat.includes("2026-10-24:retour"));
  assert.ok(model.week.every((day) => day.events.every((event) => ["green", "orange", "red"].includes(event.dot))));
});

test("un dossier sans mise à jour depuis 14 jours est en panne", () => {
  const model = buildRefonteModel(
    emptyInput([
      booking({ id: "quiet", start: "2026-11-02", updatedAt: "2026-10-01", visible: false }),
      booking({ id: "fresh", start: "2026-11-03", updatedAt: "2026-10-22", visible: false, customerId: "c2" }),
    ]),
    TODAY
  );
  assert.deepEqual(model.stuck.map((row) => row.id), ["quiet"]);
});

test("l’argent du mois est fictif et alerte sous 12 %", () => {
  const low = buildRefonteModel(
    {
      ...emptyInput([booking({ id: "b", start: "2026-10-20", end: "2026-10-28", sale: 1000, visible: true })]),
      costs: [{ bookingId: "b", amount: 950 }],
    },
    TODAY
  );
  assert.equal(low.money.under, true);
  assert.equal(low.money.fictive, true);
  assert.notEqual(low.money.sale, 1000);
  assert.notEqual(low.money.cost, 950);
  const high = dossierFinance(booking({ id: "b", sale: 1000 }), 700, 120);
  assert.equal(high.under, false);
  assert.equal(high.sale, 1000);
  assert.notEqual(high.cost, 700);
  const hidden = fictiveAmounts(5000, null);
  assert.equal(hidden.cost, null);
});

test("le cycle du dossier choisit un seul bouton", () => {
  const model = buildRefonteModel(
    {
      ...emptyInput([booking({ id: "b", start: "2026-11-04", end: "2026-11-08", visible: false })]),
      arrivals: [{ id: "a", bookingId: "b", itemTitle: "Hôtel", status: "paying" }],
      checks: [{ id: "e", bookingId: "b", travelerId: "t", program: "ETA", status: "en_attente" }],
    },
    TODAY
  );
  const dossier = model.dossiers[0];
  assert.equal(dossier.primary, "Régler le fournisseur");
  assert.equal(dossier.steps.find((step) => step.id === "preparation")?.state, "done");
  assert.equal(dossier.steps.find((step) => step.id === "fournisseurs")?.state, "current");
  assert.equal(dossier.column, "preparation");
  const shown = buildRefonteModel(emptyInput([booking({ id: "v", start: "2026-11-04", visible: true })]), TODAY);
  assert.equal(shown.dossiers[0].primary, "Séjour prêt");
  assert.equal(shown.dossiers[0].column, "visible");
  assert.equal(dossierTab("faire"), "faire");
  assert.equal(dossierTab("nope"), "voyage");
});

test("les messages réunissent WhatsApp, courrier et import", () => {
  const model = buildRefonteModel(
    {
      ...emptyInput([booking({ id: "b" })]),
      whatsapp: [
        { id: "w1", at: "2026-10-24T10:00:00Z", customerId: "c1", bookingId: "b", direction: "inbound", preview: "Bonjour" },
        { id: "w0", at: "2026-10-23T10:00:00Z", customerId: "c1", bookingId: "b", direction: "outbound", preview: "Ancien" },
      ],
      mails: [{ id: "h1", at: "2026-10-22T10:00:00Z", bookingId: "b", preview: "Arrivée", waiting: true }],
      emails: [{ id: "i1", at: "2026-10-21T10:00:00Z", label: "Little Emperors", preview: "Pièce", bookingId: "b", waiting: true }],
    },
    TODAY
  );
  assert.deepEqual(
    model.messages.map((row) => row.channel).sort(),
    ["import", "mail", "whatsapp"]
  );
  assert.equal(model.messages.find((row) => row.channel === "whatsapp")?.preview, "Bonjour");
  assert.equal(model.counts.messages, 3);
});
