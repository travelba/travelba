import assert from "node:assert/strict";
import test from "node:test";
import { unfoldMail } from "./nested-mail";
import { fillStayFromItems, parsedItemsFromText } from "./ingest-parse";
import { emptyBookingExtract } from "./ingest-types";
import { executeInboxPlan, INBOX_HOLDS, planInboxOrganization } from "./inbox-organize";
import type { TripDossier } from "./trip-match";
import type { BookingExtract } from "./ingest-types";

const TICKET = `Reçu de Billet Electronique
Passager : BERDA/DAVID MR
Lundi 17 décembre 2026
Référence du dossier YQYS8U
AIR FRANCE AF 258 (Opéré Par AIR FRANCE,
17 décembre 13:20 CHARLES DE GAULLE Départ
18 décembre 07:40 TAN SON NHAT Arrivée
Business (C) Classe
Référence du dossier compagnie AF/YQYS8U
Compagnie émettrice : AIR FRANCE
`;

function wrapper(inner: string) {
  return [
    "Subject: ",
    "From: Travel Booking Tools <reservations@travelbt.fr>",
    "To: reservations@travelba.fr",
    "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=wrap",
    "",
    "--wrap",
    "Content-Type: message/rfc822; name=\"Votre recu de billet electronique.eml\"",
    "Content-Disposition: attachment; filename=\"Votre recu de billet electronique.eml\"",
    "Content-Transfer-Encoding: 7bit",
    "",
    "Subject: Votre reçu de billet électronique : BERDA/DAVID",
    "Content-Type: text/plain; charset=utf-8",
    "",
    inner,
    "--wrap--",
    "",
  ].join("\n");
}

function ticketExtract(): BookingExtract {
  const parsed = parsedItemsFromText(TICKET);
  return fillStayFromItems({
    ...emptyBookingExtract(),
    document_status: parsed.status || "confirmed",
    travelers: parsed.travelers,
    items: parsed.items,
    destination: "Hô Chi Minh",
    title: "Hô Chi Minh",
  });
}

const hotel: TripDossier = {
  id: "dossier-hcm",
  customerId: "client-berda",
  reference: "TB-2026-0148",
  status: "draft",
  visible: false,
  start: "2026-12-18",
  end: "2026-12-21",
  places: ["Hô Chi Minh", "Park Hyatt Saigon"],
  people: [{ first_name: "David", last_name: "Berda" }],
};

const conDao: TripDossier = {
  id: "dossier-con-dao",
  customerId: "client-berda",
  reference: "TB-2026-0149",
  status: "draft",
  visible: false,
  start: "2026-12-21",
  end: "2026-12-24",
  places: ["Con Dao", "Six Senses Con Dao"],
  people: [{ first_name: "David", last_name: "Berda" }],
};

test("un objet vide et un .eml imbriqué donnent le vol, le passager et le PNR", () => {
  const unfolded = unfoldMail(wrapper(TICKET));
  assert.match(unfolded.texts.join("\n"), /YQYS8U/);
  assert.match(unfolded.texts.join("\n"), /BERDA\/DAVID/);
  const parsed = parsedItemsFromText(unfolded.texts.join("\n"));
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0]?.kind, "flight");
  assert.equal(parsed.items[0]?.confirmation_ref, "YQYS8U");
  assert.equal(parsed.items[0]?.details?.from, "CDG");
  assert.equal(parsed.items[0]?.details?.to, "SGN");
  assert.equal(parsed.items[0]?.details?.flight_number, "AF 258");
  assert.equal(parsed.items[0]?.amount, null);
  assert.equal(parsed.travelers[0]?.first_name, "David");
  assert.equal(parsed.travelers[0]?.last_name, "Berda");
});

test("le billet rejoint le dossier hôtel sans absorber Con Dao", async () => {
  const extract = ticketExtract();
  const plan = planInboxOrganization({
    extract,
    fromEmail: "reservations@travelbt.fr",
    dossiers: [hotel, conDao],
    customerId: "client-berda",
  });
  assert.equal(plan.action, "attach");
  if (plan.action !== "attach") return;
  assert.equal(plan.bookingId, "dossier-hcm");
  assert.deepEqual(plan.mergeIds, []);
  const calls = { apply: 0, persist: 0, merge: [] as string[], attached: "" };
  const result = await executeInboxPlan(plan, extract, {
    ensureCompanions: async () => undefined,
    findCustomerByName: async () => null,
    createCustomer: async () => {
      throw new Error("fiche");
    },
    persist: async () => {
      calls.persist += 1;
      return { id: "nouveau" };
    },
    apply: async (bookingId) => {
      calls.apply += 1;
      assert.equal(bookingId, "dossier-hcm");
    },
    merge: async (_keep, drop) => {
      calls.merge.push(drop);
      return { ok: true, message: null };
    },
    markAttached: async (bookingId) => {
      calls.attached = bookingId;
    },
    hold: async (message) => {
      throw new Error(message);
    },
  });
  assert.equal(result.attached, true);
  assert.equal(calls.persist, 0);
  assert.equal(calls.apply, 1);
  assert.deepEqual(calls.merge, []);
  assert.equal(calls.attached, "dossier-hcm");
});

test("un séjour déjà Visible ne reçoit pas les cartes du mail", async () => {
  const shown = { ...hotel, id: "dossier-visible", visible: true, reference: "TB-2026-0100" };
  const plan = planInboxOrganization({
    extract: ticketExtract(),
    fromEmail: "reservations@travelbt.fr",
    dossiers: [shown],
    customerId: "client-berda",
  });
  assert.equal(plan.action, "propose");
  if (plan.action !== "propose") return;
  assert.equal(plan.bookingId, "dossier-visible");
  assert.match(plan.message, /Visible/);
  const calls = { apply: 0, merge: 0, hold: "", proposed: "" };
  const result = await executeInboxPlan(plan, ticketExtract(), {
    ensureCompanions: async () => undefined,
    findCustomerByName: async () => null,
    createCustomer: async () => {
      throw new Error("fiche");
    },
    persist: async () => {
      throw new Error("création");
    },
    apply: async () => {
      calls.apply += 1;
    },
    merge: async () => {
      calls.merge += 1;
      return { ok: true, message: null };
    },
    markAttached: async () => undefined,
    propose: async (bookingId) => {
      calls.proposed = bookingId;
    },
    hold: async (message) => {
      calls.hold = message;
    },
  });
  assert.equal(result.attached, false);
  assert.equal(calls.apply, 0);
  assert.equal(calls.merge, 0);
  assert.equal(calls.proposed, "dossier-visible");
  assert.match(calls.hold, /validation/);
});

test("sans dossier, la fiche et un séjour caché sont préparés, sans prix inventé", () => {
  const extract = ticketExtract();
  const plan = planInboxOrganization({
    extract,
    fromEmail: "reservations@travelbt.fr",
    dossiers: [],
  });
  assert.equal(plan.action, "create_customer");
  if (plan.action !== "create_customer") return;
  assert.equal(plan.firstName, "David");
  assert.equal(plan.lastName, "Berda");
  assert.equal(plan.email, null);
  assert.equal(extract.items[0]?.amount, null);
});

test("un dossier supprimé et une lecture vide restent expliqués en français", () => {
  const extract = ticketExtract();
  const suppressed = planInboxOrganization({
    extract,
    dossiers: [],
    suppressions: [{ reference: "TB-2026-0147", confirmation_refs: ["YQYS8U"] }],
  });
  assert.deepEqual(suppressed, { action: "hold", message: "Ce dossier a été supprimé. Il n’est pas recréé." });
  const empty = planInboxOrganization({
    extract: emptyBookingExtract(),
    dossiers: [hotel],
    unreadTicket: true,
  });
  assert.deepEqual(empty, { action: "hold", message: INBOX_HOLDS.unread });
});
