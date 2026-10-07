import assert from "node:assert/strict";
import test from "node:test";
import { countryForIata } from "./airports";
import { maskPassportNumber } from "./esta";
import {
  UK_ETA_APPLY_URL,
  itemMentionsUk,
  planUkEtaCheck,
  textMentionsUk,
  tripNeedsUkEta,
  ukEtaAgencyDraft,
  ukEtaAlerts,
  ukEtaBadge,
  ukEtaClientAutoSend,
  ukEtaClientDraft,
  ukEtaCoversTrip,
  ukEtaShouldOfferApply,
  pickUkEtaCronBookings,
  ukEtaCronDeparture,
  ukEtaDispatchDue,
  ukEtaExempt,
  ukEtaNoteCaption,
  ukEtaOnDailyList,
  ukEtaTravelerLine,
  ukEtaWebhookBody,
  ukEtaWebhookHeader,
} from "./uk-eta";
import {
  UK_ETA_PENDING_LABEL,
  UK_ETA_STALE_LABEL,
  mergeUkEtaPoll,
  ukEtaCheckPending,
  ukEtaCheckedLabel,
  ukEtaRequestAt,
  ukEtaRequestedLabel,
} from "./uk-eta-ui";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

const PASSPORT = "12AB34567";
const NOW = Date.parse("2026-10-06T12:00:00Z");

function hotel(details: Record<string, unknown>, lifecycle?: string, title?: string) {
  return { kind: "hotel", lifecycle: lifecycle || "active", title: title || "Hôtel", details };
}

function flight(details: Record<string, unknown>, lifecycle?: string) {
  return { kind: "flight", lifecycle: lifecycle || "active", title: "Vol", details };
}

function rail(details: Record<string, unknown>, title = "Eurostar") {
  return { kind: "rail", lifecycle: "active", title, details };
}

test("aéroports et mots du Royaume-Uni", () => {
  assert.equal(countryForIata("LHR"), "GB");
  assert.equal(countryForIata("LGW"), "GB");
  assert.equal(countryForIata("LCY"), "GB");
  assert.equal(countryForIata("STN"), "GB");
  assert.equal(countryForIata("LTN"), "GB");
  assert.equal(countryForIata("MAN"), "GB");
  assert.equal(countryForIata("EDI"), "GB");
  assert.equal(countryForIata("DUB"), "IE");
  assert.equal(textMentionsUk("London"), true);
  assert.equal(textMentionsUk("Londres"), true);
  assert.equal(textMentionsUk("Edinburgh"), true);
  assert.equal(textMentionsUk("Édimbourg"), true);
  assert.equal(textMentionsUk("Manchester"), true);
  assert.equal(textMentionsUk("St Pancras"), true);
  assert.equal(textMentionsUk("Saint-Pancras"), true);
  assert.equal(textMentionsUk("Royaume-Uni"), true);
  assert.equal(textMentionsUk("United Kingdom"), true);
  assert.equal(textMentionsUk("vol LHR"), true);
  assert.equal(textMentionsUk("New York"), false);
  assert.equal(textMentionsUk("London, Ontario"), false);
  assert.equal(textMentionsUk("Paris"), false);
  assert.equal(textMentionsUk("Dublin"), false);
  assert.equal(textMentionsUk("Irlande"), false);
});

test("un vol, un Eurostar ou un hôtel au Royaume-Uni", () => {
  assert.equal(itemMentionsUk(flight({ from: "CDG", to: "LHR" })), true);
  assert.equal(itemMentionsUk(flight({ from: "LGW", to: "CDG" })), true);
  assert.equal(itemMentionsUk(flight({ from: "CDG", to: "LCY", via: "STN" })), true);
  assert.equal(itemMentionsUk(flight({ from: "CDG", to: "JFK" })), false);
  assert.equal(itemMentionsUk(flight({ from: "CDG", to: "DUB" })), false);
  assert.equal(itemMentionsUk(flight({ from: "CDG", to: "LHR" }, "cancelled")), false);
  assert.equal(itemMentionsUk(rail({ from: "Paris", to: "London St Pancras" })), true);
  assert.equal(itemMentionsUk(rail({ from: "Paris", to: "Bruxelles" }, "Eurostar")), false);
  assert.equal(itemMentionsUk(hotel({ country: "United Kingdom", city: "Londres" })), true);
  assert.equal(itemMentionsUk(hotel({ country: "Royaume-Uni", city: "London" })), true);
  assert.equal(itemMentionsUk(hotel({ city: "Édimbourg" })), true);
  assert.equal(itemMentionsUk(hotel({ city: "Manchester" })), true);
  assert.equal(itemMentionsUk(hotel({ country: "France", city: "Paris" })), false);
  assert.equal(itemMentionsUk(hotel({ country: "Canada", city: "London" })), false);
  assert.equal(itemMentionsUk(hotel({ country: "United Kingdom" }, "superseded")), false);
});

test("TB-2026-0040, TB-2026-0041 et TB-2026-0043 : destination London", () => {
  const shapes = [
    { destination: "London", title: "NoMad London", city: "Londres", country: "United Kingdom" },
    { destination: "London", title: "NoMad London", city: "Londres", country: "United Kingdom" },
    { destination: "London", title: "The NoMad Hotel, London", city: "London", country: "United Kingdom" },
  ];
  for (const shape of shapes) {
    assert.equal(
      tripNeedsUkEta({ destination: shape.destination, title: shape.title }, [
        hotel({ city: shape.city, country: shape.country, hotel_name: shape.title }, "active", shape.title),
      ]),
      true
    );
  }
  assert.equal(tripNeedsUkEta({ destination: "London", title: "Séjour" }, []), false);
  assert.equal(
    tripNeedsUkEta({ destination: "London", title: "Séjour" }, [hotel({ country: "United Kingdom" }, "cancelled")]),
    false
  );
  assert.equal(
    tripNeedsUkEta({ destination: "Paris", title: "Week-end" }, [hotel({ country: "France", city: "Paris" })]),
    false
  );
  assert.equal(
    tripNeedsUkEta({ destination: "New York", title: "New York" }, [hotel({ country: "United States", city: "New York" })]),
    false
  );
  assert.equal(
    tripNeedsUkEta({ destination: null, title: null }, [flight({ from: "CDG", to: "EDI" })]),
    true
  );
});

test("britannique et irlandais non concernés, les autres à vérifier", () => {
  assert.equal(ukEtaExempt("Britannique"), true);
  assert.equal(ukEtaExempt("British"), true);
  assert.equal(ukEtaExempt("GB"), true);
  assert.equal(ukEtaExempt("Royaume-Uni"), true);
  assert.equal(ukEtaExempt("Irlandaise"), true);
  assert.equal(ukEtaExempt("Irish"), true);
  assert.equal(ukEtaExempt("IE"), true);
  assert.equal(ukEtaExempt("Française"), false);
  assert.equal(ukEtaExempt(null), false);
  assert.equal(
    planUkEtaCheck({
      tripNeedsUkEta: true,
      passport: { id: "doc-gb", nationality: "Britannique" },
      previous: null,
    })?.status,
    "non_concerne"
  );
  assert.equal(
    planUkEtaCheck({
      tripNeedsUkEta: true,
      passport: { id: "doc-ie", nationality: "Irlandaise" },
      previous: null,
    })?.status,
    "non_concerne"
  );
  assert.equal(
    planUkEtaCheck({
      tripNeedsUkEta: true,
      passport: { id: "doc-fr", nationality: "FR" },
      previous: null,
    })?.status,
    "a_verifier"
  );
  assert.equal(
    planUkEtaCheck({
      tripNeedsUkEta: true,
      passport: { id: "doc-xx", nationality: null },
      previous: null,
    })?.status,
    "a_verifier"
  );
  assert.equal(
    planUkEtaCheck({
      tripNeedsUkEta: true,
      passport: null,
      previous: null,
    }),
    null
  );
});

test("la file reprend les mêmes cas que l’ESTA, dans les 90 jours", () => {
  const base = {
    departure: "2026-12-01",
    today: "2026-10-06",
    returnOn: "2026-12-15",
    passportNumber: PASSPORT,
    nowMs: NOW,
  };
  assert.equal(ukEtaOnDailyList({ ...base, status: "a_verifier", checkedAt: null }), true);
  assert.equal(ukEtaOnDailyList({ ...base, status: "a_verifier", checkedAt: "2026-10-06T11:50:00Z" }), true);
  assert.equal(ukEtaOnDailyList({ ...base, status: "introuvable", checkedAt: "2026-10-05T12:00:00Z" }), false);
  assert.equal(ukEtaOnDailyList({ ...base, status: "introuvable", checkedAt: "2026-09-01T12:00:00Z" }), true);
  assert.equal(
    ukEtaOnDailyList({
      ...base,
      status: "approuve",
      checkedAt: "2026-10-05T12:00:00Z",
      validUntil: "2026-12-10",
      passportLast3: "567",
    }),
    true
  );
  assert.equal(
    ukEtaOnDailyList({
      ...base,
      status: "approuve",
      checkedAt: "2026-10-05T12:00:00Z",
      validUntil: "2027-08-29",
      passportLast3: "000",
    }),
    true
  );
  assert.equal(
    ukEtaOnDailyList({
      ...base,
      status: "approuve",
      checkedAt: "2026-10-05T12:00:00Z",
      validUntil: "2027-08-29",
      passportLast3: "567",
    }),
    false
  );
  assert.equal(ukEtaOnDailyList({ ...base, departure: "2027-02-01", status: "a_verifier", checkedAt: null }), false);
  assert.equal(ukEtaOnDailyList({ ...base, status: "non_concerne", checkedAt: null }), false);
});

test("libellés, validité et masquage", () => {
  const alerts = ukEtaAlerts({
    status: "approuve",
    validUntil: "2028-03-26",
    returnOn: "2026-11-03",
    passportExpires: "2028-03-26",
    passportNumber: PASSPORT,
    passportLast3: "567",
  });
  assert.equal(ukEtaCoversTrip("approuve", alerts), true);
  assert.equal(ukEtaShouldOfferApply("approuve", alerts), false);
  assert.equal(ukEtaShouldOfferApply("introuvable", []), true);
  assert.equal(ukEtaShouldOfferApply("approuve", ["ancien_passeport"]), true);
  assert.equal(ukEtaBadge({ status: "approuve", validUntil: "2028-03-26", alerts }).label, "Valable jusqu’au 26/03/2028");
  assert.equal(ukEtaBadge({ status: "introuvable", alerts: [] }).label, "Introuvable");
  assert.equal(ukEtaBadge({ status: "refuse", alerts: [] }).label, "Refusé");
  assert.equal(ukEtaBadge({ status: "non_concerne", alerts: [] }).label, "Non concerné");
  assert.equal(ukEtaBadge({ status: "a_verifier", alerts: [] }).label, "À vérifier");
  const beforeReturn = ukEtaAlerts({
    status: "approuve",
    validUntil: "2026-11-01",
    returnOn: "2026-11-03",
    passportNumber: PASSPORT,
    passportLast3: "567",
  });
  assert.equal(ukEtaBadge({ status: "approuve", validUntil: "2026-11-01", alerts: beforeReturn }).label, "Expire avant le retour");
  const oldPassport = ukEtaAlerts({
    status: "approuve",
    validUntil: "2028-01-01",
    returnOn: "2026-11-03",
    passportNumber: PASSPORT,
    passportLast3: "000",
  });
  assert.equal(ukEtaBadge({ status: "approuve", alerts: oldPassport }).label, "Liée à un ancien passeport");
  assert.equal(ukEtaNoteCaption(`passeport ${PASSPORT}`, [PASSPORT])?.includes(PASSPORT), false);
  assert.match(ukEtaNoteCaption(`passeport ${PASSPORT}`, [PASSPORT]) || "", /567/);
  assert.equal(maskPassportNumber(PASSPORT).endsWith("567"), true);
  assert.doesNotMatch(maskPassportNumber(PASSPORT), /12AB34567/);
  const agency = ukEtaAgencyDraft({
    reference: "TB-2026-0040",
    travelerName: "Voyageur",
    status: "introuvable",
    alerts: [],
    href: "https://travelba.fr/admin/reservations/x",
    note: `vu ${PASSPORT}`,
    passportNumbers: [PASSPORT],
  });
  assert.equal(agency.kind, "alerte");
  assert.doesNotMatch(agency.text, /12AB34567/);
  assert.match(agency.text, /567/);
  assert.match(agency.text, /introuvable/i);
});

test("le message client explique l’ETA, sans numéro de passeport", () => {
  const missing = ukEtaClientDraft({ status: "introuvable", alerts: [], reference: "TB-2026-0040" });
  assert.match(missing?.text || "", /20 £/);
  assert.match(missing?.text || "", /enfants compris/);
  assert.match(missing?.text || "", new RegExp(UK_ETA_APPLY_URL.replace(/\./g, "\\.")));
  assert.match(missing?.text || "", /application UK ETA/);
  assert.match(missing?.text || "", /3 jours ouvrés/);
  assert.match(missing?.text || "", /2 ans/);
  assert.match(missing?.text || "", /liée au passeport/);
  assert.doesNotMatch(missing?.text || "", /12AB34567/);
  const refused = ukEtaClientDraft({ status: "refuse", alerts: [] });
  assert.match(refused?.text || "", /refusée/);
  const expired = ukEtaClientDraft({
    status: "approuve",
    validUntil: "2026-11-01",
    alerts: ["expire_avant_retour"],
  });
  assert.match(expired?.text || "", /01\/11\/2026/);
  assert.match(expired?.text || "", /gov\.uk\/eta/);
  const old = ukEtaClientDraft({ status: "approuve", validUntil: "2028-01-01", alerts: ["ancien_passeport"] });
  assert.match(old?.text || "", /ancien passeport/);
  const ok = ukEtaClientDraft({ status: "approuve", validUntil: "2028-03-26", alerts: [] });
  assert.match(ok?.text || "", /26\/03\/2028/);
  assert.equal(ukEtaClientDraft({ status: "a_verifier", alerts: [] }), null);
  assert.equal(ukEtaClientDraft({ status: "non_concerne", alerts: [] }), null);
  assert.equal(ukEtaClientAutoSend(undefined), false);
  assert.equal(ukEtaClientAutoSend("oui"), true);
  assert.equal(ukEtaClientAutoSend("1"), true);
});

test("le webhook ne porte que les identifiants, avec Bearer", () => {
  const body = ukEtaWebhookBody({
    id: "check-1",
    bookingId: "booking-1",
    travelerId: "traveler-1",
    departureDate: "2026-10-30T08:00:00Z",
  });
  assert.deepEqual(Object.keys(body).sort(), ["booking_id", "departure_date", "id", "kind", "traveler_id"]);
  assert.equal(body.kind, "uk_eta");
  assert.equal(body.departure_date, "2026-10-30");
  const json = JSON.stringify(body);
  assert.doesNotMatch(json, /passport|passeport|mrz|birth|naissance|12AB34567/i);
  const header = ukEtaWebhookHeader("secret-key", null);
  assert.equal(header.name, "Authorization");
  assert.equal(header.value, "Bearer secret-key");
  const custom = ukEtaWebhookHeader("secret-key", "X-Uk-Eta-Key");
  assert.equal(custom.name, "X-Uk-Eta-Key");
  assert.equal(custom.value, "secret-key");
  assert.equal(
    ukEtaDispatchDue({
      desiredKey: "auto:doc-1",
      storedKey: "auto:doc-1",
      dispatchedAt: null,
      attemptAt: "2026-10-06T11:50:00Z",
      nowMs: NOW,
    }),
    false
  );
  assert.equal(
    ukEtaDispatchDue({
      desiredKey: "auto:doc-1",
      storedKey: "auto:doc-1",
      dispatchedAt: null,
      attemptAt: "2026-10-06T11:40:00Z",
      nowMs: NOW,
    }),
    true
  );
});

const TRAVELER = { id: "traveler-1", first_name: "Camille", last_name: "Martin" } as CrmBookingTraveler;

function line(input: {
  status: "a_verifier" | "approuve" | "introuvable" | "refuse" | "en_attente" | "erreur";
  validUntil?: string | null;
  checkedAt?: string | null;
  note?: string | null;
  dispatchedAt?: string | null;
  attemptAt?: string | null;
  nowMs?: number;
}) {
  return ukEtaTravelerLine({
    traveler: TRAVELER,
    status: input.status,
    validUntil: input.validUntil,
    checkedAt: input.checkedAt,
    note: input.note,
    returnOn: "2026-11-03",
    passport: { number: PASSPORT, expires_on: "2028-06-01" } as CrmTravelDocument,
    passportLast3: "567",
    dispatchedAt: input.dispatchedAt,
    attemptAt: input.attemptAt,
    nowMs: input.nowMs ?? NOW,
  });
}

test("une vérification en cours affiche l’heure de Paris, puis le résultat", () => {
  assert.equal(ukEtaRequestAt({ dispatchedAt: "2026-10-06T12:00:00Z", attemptAt: "2026-10-06T11:59:00Z" }), "2026-10-06T12:00:00Z");
  assert.equal(ukEtaRequestAt({ dispatchedAt: "2026-10-06T11:00:00Z", attemptAt: "2026-10-06T12:10:00Z" }), "2026-10-06T12:10:00Z");
  assert.equal(ukEtaCheckPending({ dispatchedAt: "2026-10-06T12:00:00Z", checkedAt: null }), true);
  assert.equal(ukEtaCheckPending({ dispatchedAt: "2026-10-06T12:00:00Z", checkedAt: "2026-10-06T11:00:00Z" }), true);
  assert.equal(ukEtaCheckPending({ dispatchedAt: "2026-10-06T12:00:00Z", checkedAt: "2026-10-06T12:05:00Z" }), false);

  const pending = line({ status: "a_verifier", dispatchedAt: "2026-10-06T12:00:00Z" });
  assert.equal(pending.pending, true);
  assert.equal(pending.stale, false);
  assert.equal(pending.badge, UK_ETA_PENDING_LABEL);
  assert.equal(pending.checkedLabel, "demandée à 14:00");
  assert.equal(ukEtaRequestedLabel("2026-10-06T12:00:00Z"), "demandée à 14:00");
  assert.equal(pending.canSend, false);
  assert.equal(pending.caption, null);

  const stale = line({
    status: "a_verifier",
    dispatchedAt: "2026-10-06T12:00:00Z",
    nowMs: Date.parse("2026-10-06T12:20:00Z"),
  });
  assert.equal(stale.stale, true);
  assert.equal(stale.badge, UK_ETA_STALE_LABEL);
  assert.equal(stale.checkedLabel, "demandée à 14:00");

  const done = line({
    status: "introuvable",
    checkedAt: "2026-10-06T12:07:00Z",
    dispatchedAt: "2026-10-06T12:00:00Z",
    nowMs: NOW + 60_000,
  });
  assert.equal(done.pending, false);
  assert.equal(done.badge, "Introuvable");
  assert.equal(done.checkedLabel, "Vérifié le 06/10 à 14:07");
  assert.equal(ukEtaCheckedLabel("2026-10-06T12:07:00Z"), "Vérifié le 06/10 à 14:07");

  const optimistic = {
    ...line({ status: "a_verifier" }),
    pending: true,
    badge: UK_ETA_PENDING_LABEL,
    checkedLabel: "demandée à 14:00",
    requestedAt: "2026-10-06T12:00:00Z",
    caption: null,
    canSend: false,
  };
  const unchanged = line({ status: "a_verifier", checkedAt: "2026-10-05T08:00:00Z" });
  assert.equal(mergeUkEtaPoll([optimistic], [unchanged], NOW)[0]?.badge, UK_ETA_PENDING_LABEL);
  const answered = line({
    status: "approuve",
    validUntil: "2028-03-26",
    checkedAt: "2026-10-06T12:07:00Z",
    dispatchedAt: "2026-10-06T12:00:00Z",
  });
  assert.equal(mergeUkEtaPoll([optimistic], [answered], NOW)[0]?.badge, "Valable jusqu’au 26/03/2028");
});

test("le cron prend la date du dossier, sinon le premier début de carte", () => {
  assert.equal(
    ukEtaCronDeparture({
      startDate: "2026-11-02",
      items: [{ start_at: "2026-10-20T08:00:00Z", lifecycle: "active" }],
    }),
    "2026-11-02"
  );
  assert.equal(
    ukEtaCronDeparture({
      startDate: null,
      items: [
        { start_at: "2026-11-04T22:30:00Z", lifecycle: "active" },
        { start_at: "2026-10-29T23:30:00Z", lifecycle: "cancelled" },
        { start_at: "2026-11-01T10:00:00Z", lifecycle: "active" },
      ],
    }),
    "2026-11-01"
  );
  const picked = pickUkEtaCronBookings(
    [
      { id: "b", departure: "2026-12-02" },
      { id: "a", departure: "2026-12-02" },
      { id: "c", departure: "2026-10-01" },
      { id: "d", departure: null },
      { id: "e", departure: "2027-02-01" },
    ],
    "2026-10-06",
    2
  );
  assert.deepEqual(
    picked.map((row) => row.id),
    ["a", "b"]
  );
});
