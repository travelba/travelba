import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientActivity } from "../../components/admin/ClientActivity";
import {
  buildClientActivityFeed,
  clientActivityDayLabel,
  parisCalendarDay,
  parisClock,
  type ClientActivityBooking,
  type ClientActivityCustomer,
  type ClientActivityEventRow,
  type ClientActivityLogin,
} from "./client-activity-feed";

const TODAY = "2026-10-19";

const CAMILLE: ClientActivityCustomer = {
  id: "client-1",
  first_name: "Camille",
  last_name: "Morel",
  auth_user_id: "user-camille",
};

const JONAS: ClientActivityCustomer = {
  id: "client-2",
  first_name: "Jonas",
  last_name: "Keller",
  auth_user_id: "user-jonas",
};

const AGENT: ClientActivityCustomer = {
  id: "staff-customer",
  first_name: "Agence",
  last_name: "Martin",
  auth_user_id: "user-agent",
};

const STAY: ClientActivityBooking = {
  id: "booking-1",
  reference: "TB-2026-0055",
  title: "Tel-Aviv",
  destination: "Tel-Aviv",
};

function login(partial: Partial<ClientActivityLogin> & Pick<ClientActivityLogin, "id" | "created_at">): ClientActivityLogin {
  return {
    customer_id: "client-1",
    auth_user_id: "user-camille",
    method: "password",
    staff_id: null,
    ...partial,
  };
}

function gesture(
  partial: Partial<ClientActivityEventRow> & Pick<ClientActivityEventRow, "id" | "created_at" | "summary">
): ClientActivityEventRow {
  return {
    customer_id: "client-1",
    auth_user_id: "user-camille",
    action: "view",
    detail: null,
    booking_id: null,
    ...partial,
  };
}

test("l’heure et le jour se lisent à Paris", () => {
  assert.equal(parisCalendarDay("2026-10-19T22:30:00.000Z"), "2026-10-20");
  assert.equal(parisClock("2026-10-19T22:30:00.000Z"), "00h30");
  assert.equal(parisCalendarDay("2026-11-08T23:30:00.000Z"), "2026-11-09");
  assert.equal(parisClock("2026-10-19T12:32:00.000Z"), "14h32");
  assert.equal(clientActivityDayLabel("2026-10-19", TODAY), "Aujourd’hui");
  assert.equal(clientActivityDayLabel("2026-10-18", TODAY), "Hier");
  assert.equal(clientActivityDayLabel("2026-10-14", TODAY), "Mercredi 14 octobre");
});

test("les connexions se groupent sur sept jours, sans l’agence", () => {
  const groups = buildClientActivityFeed({
    today: TODAY,
    staffAuthIds: ["user-agent", "USER-PARTNER"],
    customers: [CAMILLE, JONAS, AGENT],
    bookings: [STAY],
    logins: [
      login({ id: "late", created_at: "2026-10-19T16:00:00.000Z" }),
      login({ id: "early", created_at: "2026-10-19T07:15:00.000Z", method: "magiclink" }),
      login({ id: "yesterday", created_at: "2026-10-18T18:00:00.000Z" }),
      login({ id: "edge", created_at: "2026-10-11T22:30:00.000Z" }),
      login({ id: "too-old", created_at: "2026-10-11T20:00:00.000Z" }),
      login({ id: "desk", created_at: "2026-10-19T15:00:00.000Z", method: "desk", staff_id: "staff-1" }),
      login({
        id: "agent",
        created_at: "2026-10-19T15:10:00.000Z",
        customer_id: "staff-customer",
        auth_user_id: "user-agent",
      }),
      login({
        id: "partner-face",
        created_at: "2026-10-19T15:20:00.000Z",
        customer_id: "client-2",
        auth_user_id: "user-partner",
      }),
      login({
        id: "jonas",
        created_at: "2026-10-19T09:00:00.000Z",
        customer_id: "client-2",
        auth_user_id: "user-jonas",
        method: "entry",
      }),
    ],
    activity: [
      gesture({
        id: "stay",
        created_at: "2026-10-19T07:20:00.000Z",
        summary: "A ouvert le séjour Tel-Aviv (TB-2026-0055)",
        detail: "12 — 18 octobre 2026",
        booking_id: "booking-1",
      }),
      gesture({
        id: "download",
        created_at: "2026-10-19T07:40:00.000Z",
        action: "download",
        summary: "A téléchargé un document du séjour Tel-Aviv (TB-2026-0055)",
        booking_id: "booking-1",
      }),
      gesture({
        id: "other-day",
        created_at: "2026-10-18T18:05:00.000Z",
        summary: "A ouvert l’accueil",
      }),
      gesture({
        id: "without-login",
        created_at: "2026-10-17T10:00:00.000Z",
        summary: "A ouvert ses pièces",
        customer_id: "client-2",
        auth_user_id: "user-jonas",
      }),
      gesture({
        id: "unknown-booking",
        created_at: "2026-10-19T08:00:00.000Z",
        summary: "A ouvert un séjour retiré",
        booking_id: "missing",
      }),
    ],
  });

  assert.deepEqual(
    groups.map((group) => group.label),
    ["Aujourd’hui", "Hier", "Lundi 12 octobre"]
  );
  const today = groups[0].rows;
  assert.deepEqual(
    today.map((row) => row.name),
    ["Camille Morel", "Jonas Keller"]
  );
  assert.equal(today[0].href, "/admin/clients/client-1");
  assert.equal(today[0].meta, "Dernière connexion à 18h00 · 2 connexions · 3 gestes");
  assert.deepEqual(today[0].dossiers, [
    {
      id: "booking-1",
      href: "/admin/reservations/booking-1",
      label: "Tel-Aviv (TB-2026-0055)",
    },
  ]);
  assert.deepEqual(
    today[0].events.map((event) => event.text),
    [
      "Connexion · Lien magique",
      "A ouvert le séjour Tel-Aviv (TB-2026-0055)",
      "A téléchargé un document du séjour Tel-Aviv (TB-2026-0055)",
      "A ouvert un séjour retiré",
      "Connexion · Mot de passe",
    ]
  );
  assert.equal(today[0].events[1].detail, "12 — 18 octobre 2026");
  assert.equal(today[0].events[1].time, "09h20");
  assert.equal(groups[1].rows[0].meta, "Dernière connexion à 20h00 · 1 geste");
  assert.equal(groups[1].rows[0].events[1].text, "A ouvert l’accueil");
  assert.equal(groups[2].rows[0].meta, "Dernière connexion à 00h30");
  assert.equal(JSON.stringify(groups).includes("Agence Martin"), false);
  assert.equal(JSON.stringify(groups).includes("Ouverture par l’agence"), false);
  assert.equal(JSON.stringify(groups).includes("A ouvert ses pièces"), false);
});

test("sans connexion, le bloc le dit, et le nom n’est pas coupé par un badge", () => {
  const empty = renderToStaticMarkup(createElement(ClientActivity, { groups: [] }));
  assert.match(empty, /Aucune connexion/);
  assert.match(empty, /ces sept derniers jours/);
  assert.doesNotMatch(empty, /Activité clients[\s\S]*truncate/);

  const groups = buildClientActivityFeed({
    today: TODAY,
    staffAuthIds: [],
    customers: [CAMILLE],
    bookings: [STAY],
    logins: [login({ id: "now", created_at: "2026-10-19T12:32:00.000Z" })],
    activity: [
      gesture({
        id: "open",
        created_at: "2026-10-19T12:40:00.000Z",
        summary: "A ouvert le séjour Tel-Aviv (TB-2026-0055)",
        booking_id: "booking-1",
      }),
    ],
  });
  const html = renderToStaticMarkup(
    createElement(ClientActivity, { groups, initialOpen: [groups[0].rows[0].id] })
  );
  assert.match(html, /Activité clients/);
  assert.match(html, /Aujourd’hui/);
  assert.match(html, /1 aujourd’hui/);
  assert.match(html, /href="\/admin\/clients\/client-1"/);
  assert.match(html, /Camille Morel/);
  assert.match(html, /break-words/);
  assert.match(html, /flex-wrap/);
  assert.match(html, /min-h-11/);
  assert.match(html, /Dernière connexion à 14h32/);
  assert.match(html, /href="\/admin\/reservations\/booking-1"/);
  assert.match(html, /Tel-Aviv \(TB-2026-0055\)/);
  assert.match(html, /A ouvert le séjour/);
  assert.match(html, /aria-expanded="true"/);
  assert.doesNotMatch(html, /truncate/);
});
