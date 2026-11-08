import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  adminTodoLines,
  adminTodoTotal,
  checkinNeedsAction,
  countOpenCheckins,
  countTripLetters,
  countVisaWork,
  formalityNoticeNeedsAction,
  hotelLetterNeedsAction,
  tripStillOpen,
  visaRequestNeedsAction,
} from "./admin-todo";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TODAY = "2026-11-08";

test("À faire ne garde que le séjour, et cache les zéros", () => {
  const lines = adminTodoLines({
    whatsapp: 2,
    unread: 0,
    hotels: 1,
    paymentLinks: 3,
    visas: 1,
    checkins: 4,
  });
  assert.deepEqual(
    lines.map((line) => line.id),
    ["payment-links", "visas", "checkins", "whatsapp", "hotels"]
  );
  assert.equal(lines[0].label, "3 liens de paiement hôtel à traiter");
  assert.equal(lines[0].href, "/admin/reservations");
  assert.equal(lines[1].label, "1 visa à traiter");
  assert.equal(lines[1].href, "/admin/reservations?vue=formalites");
  assert.equal(lines[2].label, "4 enregistrements à faire");
  assert.equal(lines[2].href, "/admin/reservations");
  assert.equal(lines[3].label, "2 demandes WhatsApp à traiter");
  assert.equal(lines[3].href, "/admin/boite?onglet=whatsapp");
  assert.equal(lines[4].label, "1 réponse d’hôtel à traiter");
  assert.equal(lines[4].href, "/admin/boite?onglet=hotels");
  assert.equal(adminTodoTotal(lines), 11);
  const labels = lines.map((line) => line.label).join(" ");
  assert.equal(labels.includes("e-mail"), false);
  assert.equal(labels.includes("Little Emperors"), false);
  assert.equal(labels.includes("encaisser"), false);
  assert.equal(labels.includes("à pointer"), false);
  assert.equal(labels.includes("échéance"), false);
});

test("un fil WhatsApp non lu reste une ligne, à part des demandes", () => {
  const lines = adminTodoLines({
    whatsapp: 0,
    unread: 1,
    hotels: 0,
    paymentLinks: 0,
    visas: 0,
    checkins: 0,
  });
  assert.deepEqual(
    lines.map((line) => line.label),
    ["1 fil WhatsApp non lu"]
  );
  assert.equal(lines[0].href, "/admin/boite?onglet=whatsapp&filtre=non-lus");
});

test("rien à faire : liste vide", () => {
  const lines = adminTodoLines({ whatsapp: 0, paymentLinks: 0, visas: 0, checkins: 0 });
  assert.deepEqual(lines, []);
  assert.equal(adminTodoTotal(lines), 0);
});

test("le lien de paiement et le pré-check-in comptent seulement s’ils sont dus, sur un séjour ouvert", () => {
  assert.equal(hotelLetterNeedsAction({ status: "due", dueOn: "2026-12-01" }, TODAY), true);
  assert.equal(hotelLetterNeedsAction({ status: "follow_up", dueOn: null }, TODAY), true);
  assert.equal(hotelLetterNeedsAction({ status: "waiting", dueOn: TODAY }, TODAY), true);
  assert.equal(hotelLetterNeedsAction({ status: "waiting", dueOn: "2026-11-09" }, TODAY), false);
  assert.equal(hotelLetterNeedsAction({ status: "replied", dueOn: TODAY }, TODAY), false);
  assert.equal(hotelLetterNeedsAction({ status: "skipped", dueOn: TODAY }, TODAY), false);
  const rows = [
    { kind: "payment_link", status: "due", dueOn: TODAY, live: true, itemActive: true },
    { kind: "payment_link", status: "follow_up", dueOn: null, live: true, itemActive: true },
    { kind: "payment_link", status: "waiting", dueOn: "2026-12-01", live: true, itemActive: true },
    { kind: "payment_link", status: "due", dueOn: TODAY, live: false, itemActive: true },
    { kind: "payment_link", status: "due", dueOn: TODAY, live: true, itemActive: false },
    { kind: "payment_link", status: "replied", dueOn: TODAY, live: true, itemActive: true },
    { kind: "precheckin", status: "due", dueOn: TODAY, live: true, itemActive: true },
    { kind: "upgrade", status: "due", dueOn: TODAY, live: true, itemActive: true },
  ];
  assert.equal(countTripLetters(rows, "payment_link", TODAY), 2);
  assert.equal(countTripLetters(rows, "precheckin", TODAY), 1);
});

test("un séjour annulé, archivé ou terminé n’est plus à débloquer", () => {
  assert.equal(tripStillOpen({ status: "confirmed", archived_at: null, end_date: "2026-11-10" }, TODAY), true);
  assert.equal(tripStillOpen({ status: "confirmed", archived_at: null, end_date: null }, TODAY), true);
  assert.equal(tripStillOpen({ status: "cancelled", archived_at: null, end_date: "2026-11-10" }, TODAY), false);
  assert.equal(tripStillOpen({ status: "confirmed", archived_at: "2026-11-01", end_date: "2026-11-10" }, TODAY), false);
  assert.equal(tripStillOpen({ status: "confirmed", archived_at: null, end_date: "2026-11-07" }, TODAY), false);
});

test("le visa compte le parcours lancé, la tâche ouverte et l’avis à traiter", () => {
  assert.equal(visaRequestNeedsAction({ status: "en_cours", acceptedAt: "2026-11-01" }), true);
  assert.equal(visaRequestNeedsAction({ status: "refuse", acceptedAt: "2026-11-01" }), true);
  assert.equal(visaRequestNeedsAction({ status: "piece", acceptedAt: "2026-11-01" }), false);
  assert.equal(visaRequestNeedsAction({ status: "en_cours", acceptedAt: null }), false);
  assert.equal(formalityNoticeNeedsAction("a_traiter"), true);
  assert.equal(formalityNoticeNeedsAction("valable"), false);
  assert.equal(formalityNoticeNeedsAction(null), false);
  assert.equal(
    countVisaWork({
      requests: [
        { status: "en_cours", acceptedAt: "2026-11-01", live: true },
        { status: "piece", acceptedAt: "2026-11-01", live: true },
        { status: "en_cours", acceptedAt: null, live: true },
        { status: "en_cours", acceptedAt: "2026-11-01", live: false },
      ],
      tasks: [
        { live: true, open: true },
        { live: false, open: true },
      ],
      notices: [
        { kind: "a_traiter", live: true },
        { kind: "valable", live: true },
      ],
    }),
    3
  );
});

test("l’enregistrement ouvert ou en cours compte, pas celui déjà fait ni celui encore fermé", () => {
  assert.equal(checkinNeedsAction({ alert: true, done: false, cancelled: false, status: "ouvert" }), true);
  assert.equal(checkinNeedsAction({ alert: false, done: false, cancelled: false, status: "en_cours" }), true);
  assert.equal(checkinNeedsAction({ alert: false, done: false, cancelled: false, status: "a_faire" }), false);
  assert.equal(checkinNeedsAction({ alert: true, done: true, cancelled: false, status: "cartes_recues" }), false);
  assert.equal(checkinNeedsAction({ alert: true, done: false, cancelled: true, status: "ouvert" }), false);
  assert.equal(
    countOpenCheckins([
      { alert: true, done: false, cancelled: false, status: "ouvert" },
      { alert: false, done: false, cancelled: false, status: "a_faire" },
    ]),
    1
  );
});

test("l’accueil n’alimente plus la liste avec les files retirées", () => {
  const page = readFileSync(join(root, "app/admin/page.tsx"), "utf8");
  assert.match(page, /loadAccueilTodoCounts/);
  assert.equal(page.includes("badges.emails"), false);
  assert.equal(page.includes("badges.le"), false);
  assert.equal(page.includes("badges.costs"), false);
  assert.equal(page.includes("badges.pieces"), false);
  assert.equal(page.includes("badges.revolut"), false);
  const badges = readFileSync(join(root, "lib/crm/admin-badges.ts"), "utf8");
  assert.match(badges, /emails/);
  assert.match(badges, /pieces/);
  assert.match(badges, /costs/);
  const formalites = readFileSync(join(root, "components/admin/dossiers/FormalitesPanel.tsx"), "utf8");
  assert.match(formalites, /visaRequestNeedsAction/);
});
