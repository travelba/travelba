import assert from "node:assert/strict";
import { test } from "node:test";
import { timezoneForCity } from "./stay-timezone";
import { whatsappCatalog } from "./whatsapp-catalog";
import { freeMessageRatio } from "./free-message-whatsapp";
import {
  RAIL_TICKET_LEAD_MS,
  RAIL_TICKET_TEMPLATE_ENV,
  isFlightBoardingText,
  legMatchesCard,
  parseRailTicketText,
  planRailTicketSends,
  railDepartureInstant,
  railDepartureZone,
  railTicketChannel,
  railTicketContentDrafts,
  railTicketDedupeKey,
  railTicketDraftBody,
  railTicketFileHint,
  railTicketNoticeText,
  railTicketPreview,
  type RailCardFace,
  type RailDocumentFace,
} from "./rail-ticket";

const OUT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const BACK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const DOC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const DOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

const TICKET = `
Mon billet
DIMANCHE 20 DÉCEMBRE 2026
12h46 PARIS GARE DE LYON
15h36 CHAMBERY-CHALLES-LES-EAUX
2h50
TGV INOUI 6941 - 1e CLASSE
Voiture 2 Haut - Place 12
Dossier voyage : ABC123
PRÊTS ? EMBARQUEZ !
Je me présente à l'embarquement jusqu'à 2 min avant le départ.
Garantie G30 sur TGV INOUI et INTERCITÉS.
Mon billet
DIMANCHE 27 DÉCEMBRE 2026
13h24 CHAMBERY-CHALLES-LES-EAUX
16h15 PARIS GARE DE LYON
2h51
TGV INOUI 6972 - 1e CLASSE
Voiture 11 Haut - Place 17
`;

const FLIGHT = `
Carte d'embarquement
Numéro de vol
AF 1234
Siège
12A
Paris (CDG) Tel Aviv (TLV)
`;

const HOTEL = `
Confirmation d'hôtel
Hôtel du Parc
Arrivée 20 décembre 2026
`;

const INVOICE = `
Facture SNCF
Total 308 EUR
Référence ABC123
`;

function card(patch: Partial<RailCardFace> & Pick<RailCardFace, "id" | "title" | "startAt">): RailCardFace {
  return {
    supplier: "SNCF",
    visible: true,
    hidden: false,
    cancelled: false,
    details: {},
    ...patch,
  };
}

const outbound = card({
  id: OUT,
  title: "TGV INOUI 6941 Paris Gare de Lyon → Chambéry-Challes-les-Eaux, 1re",
  startAt: "2026-12-20 12:46:00+00",
  details: { voiture: "2" },
});

const inbound = card({
  id: BACK,
  title: "TGV INOUI 6972 Chambéry-Challes-les-Eaux → Paris Gare de Lyon, 1re",
  startAt: "2026-12-27 13:24:00+00",
  details: { voiture: "11" },
});

function pdf(patch: Partial<RailDocumentFace> & Pick<RailDocumentFace, "id">): RailDocumentFace {
  return {
    itemId: null,
    linkedKind: null,
    kind: "carte d'embarquement",
    fileName: "PARIS_GARE_DE_LYON-CHAMBERY_20-12-26_VOYAGEUR_ABC123.pdf",
    mime: "application/pdf",
    text: TICKET,
    retired: false,
    ...patch,
  };
}

const paris = (city: string) => (city.toLowerCase().includes("londres") || city.toLowerCase().includes("london") ? "Europe/London" : "Europe/Paris");

test("le PDF SNCF Connect porte l’aller et le retour, avec voiture et place", () => {
  const legs = parseRailTicketText(TICKET);
  assert.equal(legs.length, 2);
  assert.equal(legs[0]?.date, "2026-12-20");
  assert.equal(legs[0]?.time, "12:46");
  assert.equal(legs[0]?.number, "6941");
  assert.equal(legs[0]?.coach, "2");
  assert.equal(legs[0]?.seat, "12");
  assert.equal(legs[1]?.date, "2026-12-27");
  assert.equal(legs[1]?.time, "13:24");
  assert.equal(legs[1]?.number, "6972");
  assert.equal(legs[1]?.coach, "11");
  assert.equal(legs[1]?.seat, "17");
  assert.equal(legMatchesCard(legs[0]!, outbound), true);
  assert.equal(legMatchesCard(legs[0]!, inbound), false);
  assert.equal(legMatchesCard(legs[1]!, inbound), true);
});

test("une facture, une confirmation d’hôtel ou une carte d’avion ne sont pas des trajets", () => {
  assert.equal(parseRailTicketText(FLIGHT).length, 0);
  assert.equal(parseRailTicketText(HOTEL).length, 0);
  assert.equal(parseRailTicketText(INVOICE).length, 0);
  assert.equal(isFlightBoardingText(FLIGHT), true);
  assert.equal(isFlightBoardingText(TICKET), false);
});

test("l’heure civile +00 n’est pas l’heure UTC : hiver +1, été +2", () => {
  const winter = railDepartureInstant("2026-12-20 12:46:00+00", "Europe/Paris");
  const summer = railDepartureInstant("2026-07-15T12:46:00+00:00", "Europe/Paris");
  assert.equal(new Date(winter || 0).toISOString(), "2026-12-20T11:46:00.000Z");
  assert.equal(new Date(summer || 0).toISOString(), "2026-07-15T10:46:00.000Z");
  assert.notEqual(winter, Date.parse("2026-12-20T12:46:00+00:00"));
  assert.equal(railDepartureZone(outbound, timezoneForCity), "Europe/Paris");
  assert.equal(
    railDepartureZone(
      card({
        id: OUT,
        title: "EUROSTAR 9012 Londres Saint-Pancras → Paris Gare du Nord",
        startAt: "2026-07-06 10:22:00+00",
        supplier: "Eurostar",
      }),
      timezoneForCity
    ),
    "Europe/London"
  );
  assert.equal(
    railDepartureZone(
      card({
        id: OUT,
        title: "Train 1 Ville inconnue → Ailleurs",
        startAt: "2026-12-20 12:46:00+00",
        supplier: "Privé",
      }),
      () => null
    ),
    null
  );
});

test("la fenêtre couvre l’heure avant le départ et ignore un train passé ou trop tôt", () => {
  const instant = railDepartureInstant(outbound.startAt, "Europe/Paris") || 0;
  const due = planRailTicketSends({
    now: instant - 56 * 60 * 1000,
    bookingVisible: true,
    customerReady: true,
    cards: [outbound, inbound],
    documents: [pdf({ id: DOC }), pdf({ id: DOC_B })],
    resolveCity: paris,
  });
  assert.equal(due.length, 2);
  assert.equal(new Set(due.map((row) => row.itemId)).size, 1);
  assert.equal(due[0]?.itemId, OUT);
  assert.equal(due[0]?.place, "voiture 2, place 12");
  assert.notEqual(due[0]?.dedupeKey, due[1]?.dedupeKey);
  assert.equal(
    planRailTicketSends({
      now: instant - 80 * 60 * 1000,
      bookingVisible: true,
      customerReady: true,
      cards: [outbound],
      documents: [pdf({ id: DOC })],
      resolveCity: paris,
    }).length,
    0
  );
  assert.equal(
    planRailTicketSends({
      now: instant + 60 * 1000,
      bookingVisible: true,
      customerReady: true,
      cards: [outbound],
      documents: [pdf({ id: DOC })],
      resolveCity: paris,
    }).length,
    0
  );
  assert.ok(RAIL_TICKET_LEAD_MS >= 10 * 60 * 1000);
});

test("le retour du même PDF a une autre clé, et un second passage reste la même clé", () => {
  const backInstant = railDepartureInstant(inbound.startAt, "Europe/Paris") || 0;
  const back = planRailTicketSends({
    now: backInstant - 50 * 60 * 1000,
    bookingVisible: true,
    customerReady: true,
    cards: [outbound, inbound],
    documents: [pdf({ id: DOC })],
    resolveCity: paris,
  });
  assert.equal(back.length, 1);
  assert.equal(back[0]?.itemId, BACK);
  assert.equal(back[0]?.place, "voiture 11, place 17");
  const again = railTicketDedupeKey(BACK, DOC, inbound.startAt);
  assert.equal(back[0]?.dedupeKey, again);
  assert.notEqual(again, railTicketDedupeKey(OUT, DOC, outbound.startAt));
});

test("dossier caché, carte masquée, opt-out, avion et hôtel ne partent pas", () => {
  const now = (railDepartureInstant(outbound.startAt, "Europe/Paris") || 0) - 40 * 60 * 1000;
  const base = {
    now,
    cards: [outbound, inbound],
    documents: [pdf({ id: DOC })],
    resolveCity: paris,
  };
  assert.equal(planRailTicketSends({ ...base, bookingVisible: false, customerReady: true }).length, 0);
  assert.equal(planRailTicketSends({ ...base, bookingVisible: true, customerReady: false }).length, 0);
  assert.equal(
    planRailTicketSends({
      ...base,
      bookingVisible: true,
      customerReady: true,
      cards: [{ ...outbound, visible: false }],
    }).length,
    0
  );
  assert.equal(
    planRailTicketSends({
      ...base,
      bookingVisible: true,
      customerReady: true,
      cards: [{ ...outbound, hidden: true }, { ...inbound, cancelled: true }],
    }).length,
    0
  );
  assert.equal(
    planRailTicketSends({
      ...base,
      bookingVisible: true,
      customerReady: true,
      documents: [
        pdf({ id: DOC, text: FLIGHT, fileName: "carte-embarquement-AF7308.pdf", linkedKind: "flight" }),
        pdf({ id: DOC_B, text: HOTEL, kind: "confirmation", fileName: "confirmation-hotel.pdf" }),
        pdf({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3", text: INVOICE, kind: "facture", fileName: "facture-sncf.pdf" }),
      ],
    }).length,
    0
  );
});

test("sans texte, le nom de fichier ne déclenche que le jour qu’il cite", () => {
  const now = (railDepartureInstant(outbound.startAt, "Europe/Paris") || 0) - 30 * 60 * 1000;
  const sends = planRailTicketSends({
    now,
    bookingVisible: true,
    customerReady: true,
    cards: [outbound, inbound],
    documents: [pdf({ id: DOC, text: "" })],
    resolveCity: paris,
  });
  assert.deepEqual(sends.map((row) => row.itemId), [OUT]);
  assert.equal(
    railTicketFileHint({
      kind: "carte d'embarquement",
      fileName: "carte-embarquement-AF7308.pdf",
      mime: "application/pdf",
      linkedKind: "flight",
    }),
    false
  );
  assert.equal(
    railTicketFileHint({
      kind: "carte d'embarquement",
      fileName: "PARIS_GARE_DE_LYON-CHAMBERY_20-12-26_VOYAGEUR.pdf",
      mime: "application/pdf",
    }),
    true
  );
});

test("le modèle parle du train, et le repli est le message libre puis la session", () => {
  const drafts = railTicketContentDrafts();
  assert.equal(drafts[0]?.env, RAIL_TICKET_TEMPLATE_ENV);
  const body = railTicketDraftBody();
  assert.match(body, /billet de train/);
  assert.equal(/\bvol\b/i.test(body), false);
  assert.equal(/\bsi[eè]ge\b/i.test(body), false);
  assert.equal(/\{\{\d+\}\}(?:\s|[,:;.])*\{\{\d+\}\}/.test(body), false);
  const ratio = freeMessageRatio(body);
  assert.equal(ratio.ok, true);
  const preview = railTicketPreview({
    firstName: "Camille",
    train: "TGV INOUI 6941",
    route: "Paris Gare de Lyon → Chambéry",
    when: "20 déc. 2026 à 12h46",
    place: "voiture 2, place 12",
  });
  assert.match(preview || "", /TGV INOUI 6941/);
  assert.equal((preview || "").includes("{{"), false);
  const notice = railTicketNoticeText({
    train: "TGV INOUI 6941",
    route: "Paris Gare de Lyon → Chambéry",
    when: "20 déc. 2026 à 12h46",
    place: "voiture 2, place 12",
  });
  assert.match(notice, /joint/);
  assert.equal(
    railTicketChannel({ dedicatedSid: "HXtrain", freeDocumentSid: "HXdoc", windowOpen: false, boardingPassKind: true }),
    "billet_train"
  );
  assert.equal(
    railTicketChannel({ dedicatedSid: null, freeDocumentSid: "HXdoc", windowOpen: false, boardingPassKind: true }),
    "message_libre_document"
  );
  assert.equal(
    railTicketChannel({ dedicatedSid: "HXtrain", freeDocumentSid: "HXdoc", windowOpen: true, boardingPassKind: false }),
    "message_libre_document"
  );
  assert.equal(
    railTicketChannel({ dedicatedSid: null, freeDocumentSid: null, windowOpen: true, boardingPassKind: true }),
    "session"
  );
  assert.equal(
    railTicketChannel({ dedicatedSid: null, freeDocumentSid: null, windowOpen: false, boardingPassKind: true }),
    null
  );
  const group = whatsappCatalog().find((row) => row.id === "billets-train");
  assert.match(group?.messages[0]?.bubble.body || "", /billet de train/);
  assert.equal(group?.messages[0]?.fallback?.modelName, "message_libre_document");
  assert.equal((group?.messages[0]?.bubble.body || "").includes("{{"), false);
});
