import assert from "node:assert/strict";
import test from "node:test";
import { countryForIata } from "./airports";
import {
  ESTA_APPLY_URL,
  VWP_ISO,
  estaAgencyDraft,
  estaAirports,
  estaAlerts,
  estaBadge,
  estaClientDraft,
  estaCoversTrip,
  estaDispatchDue,
  estaEligibility,
  estaNoteCaption,
  estaOnDailyList,
  estaWebhookBody,
  estaWebhookHeader,
  flightTouchIatas,
  formatEstaDate,
  itemTouchesEsta,
  maskPassportInText,
  maskPassportNumber,
  planEstaCheck,
  tripNeedsEsta,
} from "./esta";

const PASSPORT = "12AB34567";
const NOW = Date.parse("2026-10-06T12:00:00Z");

function flight(details: Record<string, unknown>, lifecycle?: string) {
  return { kind: "flight", lifecycle: lifecycle || "active", details };
}

function hotel(country: string, lifecycle?: string) {
  return { kind: "hotel", lifecycle: lifecycle || "active", details: { country, hotel_name: "Séjour" } };
}

test("aéroports américains et territoires soumis à l’ESTA", () => {
  assert.equal(countryForIata("JFK"), "US");
  assert.equal(countryForIata("SJU"), "PR");
  assert.equal(countryForIata("STT"), "VI");
  assert.equal(countryForIata("GUM"), "GU");
  assert.equal(countryForIata("SPN"), "MP");
  assert.equal(countryForIata("PPG"), "AS");
  assert.deepEqual(estaAirports(flight({ from: "CDG", to: "JFK" })), ["JFK"]);
  assert.deepEqual(estaAirports(flight({ from: "CDG", to: "SJU" })), ["SJU"]);
  assert.deepEqual(estaAirports(flight({ from: "HNL", to: "GUM" })), ["GUM"]);
  assert.deepEqual(estaAirports(flight({ from: "NRT", to: "SPN" })), ["SPN"]);
  assert.deepEqual(estaAirports(flight({ from: "CDG", to: "STT" })), ["STT"]);
  assert.equal(itemTouchesEsta(flight({ from: "JFK", to: "CDG" })), false);
  assert.equal(itemTouchesEsta(flight({ from: "CDG", to: "PPG" })), false);
  assert.equal(itemTouchesEsta(flight({ from: "CDG", to: "LHR" })), false);
});

test("une escale aux États-Unis compte, un vol annulé non", () => {
  assert.deepEqual(flightTouchIatas({ from: "CDG", to: "MEX", via: "JFK" }), ["MEX", "JFK"]);
  assert.deepEqual(estaAirports(flight({ from: "CDG", to: "MEX", stops: ["JFK"] })), ["JFK"]);
  assert.deepEqual(estaAirports(flight({ from: "CDG", to: "MEX", route: "CDG-JFK-MEX" })), ["JFK", "MEX"].filter((code) => code === "JFK"));
  assert.deepEqual(
    estaAirports(flight({ from: "CDG", to: "MEX", segments: [{ from: "CDG", to: "EWR" }, { from: "EWR", to: "MEX" }] })),
    ["EWR"]
  );
  assert.equal(itemTouchesEsta(flight({ from: "CDG", to: "JFK" }, "cancelled")), false);
  assert.equal(itemTouchesEsta(flight({ from: "CDG", to: "JFK" }, "superseded")), false);
  assert.equal(tripNeedsEsta([flight({ from: "CDG", to: "FCO" }), hotel("France")]), false);
  assert.equal(tripNeedsEsta([flight({ from: "CDG", to: "FCO" }, "cancelled"), flight({ from: "CDG", to: "JFK" })]), true);
});

test("un hébergement aux États-Unis ou dans un territoire ESTA", () => {
  assert.equal(itemTouchesEsta(hotel("United States")), true);
  assert.equal(itemTouchesEsta(hotel("États-Unis")), true);
  assert.equal(itemTouchesEsta(hotel("USA")), true);
  assert.equal(itemTouchesEsta(hotel("Puerto Rico")), true);
  assert.equal(itemTouchesEsta(hotel("Guam")), true);
  assert.equal(itemTouchesEsta(hotel("Îles Vierges américaines")), true);
  assert.equal(itemTouchesEsta(hotel("France")), false);
  assert.equal(itemTouchesEsta(hotel("American Samoa")), false);
  assert.equal(itemTouchesEsta(hotel("Italie")), false);
  assert.equal(tripNeedsEsta([hotel("United States")]), true);
});

test("nationalité : VWP à vérifier, américain ou hors programme non concerné", () => {
  assert.equal(VWP_ISO.size, 42);
  assert.equal(estaEligibility("Française"), "vwp");
  assert.equal(estaEligibility("FRA"), "vwp");
  assert.equal(estaEligibility("QA"), "vwp");
  assert.equal(estaEligibility("IL"), "vwp");
  assert.equal(estaEligibility("GB"), "vwp");
  assert.equal(estaEligibility("US"), "us");
  assert.equal(estaEligibility("Américaine"), "us");
  assert.equal(estaEligibility("CN"), "visa");
  assert.equal(estaEligibility("RO"), "visa");
  assert.equal(estaEligibility(null), "unknown");
  assert.equal(
    planEstaCheck({
      tripNeedsEsta: true,
      passport: { id: "doc-fr", nationality: "FR" },
      previous: null,
    })?.status,
    "a_verifier"
  );
  assert.equal(
    planEstaCheck({
      tripNeedsEsta: true,
      passport: { id: "doc-us", nationality: "US" },
      previous: null,
    })?.status,
    "non_concerne"
  );
  assert.equal(
    planEstaCheck({
      tripNeedsEsta: true,
      passport: { id: "doc-cn", nationality: "CN" },
      previous: null,
    })?.status,
    "non_concerne"
  );
  assert.equal(
    planEstaCheck({
      tripNeedsEsta: true,
      passport: { id: "doc-us", nationality: "US" },
      previous: null,
    })?.dispatchKey,
    null
  );
});

test("ESTA approuvé jusqu’au 26/03/2027, passeport expire le même jour", () => {
  const alerts = estaAlerts({
    status: "approuve",
    validUntil: "2027-03-26",
    returnOn: "2027-03-20",
    passportExpires: "2027-03-26",
    passportNumber: PASSPORT,
    estaPassportLast3: "567",
  });
  assert.deepEqual(alerts, []);
  assert.equal(estaCoversTrip("approuve", alerts), true);
  assert.equal(estaBadge({ status: "approuve", validUntil: "2027-03-26", alerts }).label, "Valable jusqu’au 26/03/2027");
  assert.equal(formatEstaDate("2027-03-26"), "26/03/2027");

  const beforeReturn = estaAlerts({
    status: "approuve",
    validUntil: "2027-03-26",
    returnOn: "2027-04-02",
    passportExpires: "2027-03-26",
    passportNumber: PASSPORT,
    estaPassportLast3: "567",
  });
  assert.ok(beforeReturn.includes("expire_avant_retour"));
  assert.ok(beforeReturn.includes("passeport_expire_avant_retour"));
  assert.equal(estaBadge({ status: "approuve", validUntil: "2027-03-26", alerts: beforeReturn }).label, "Expire avant le retour");

  const beforeEsta = estaAlerts({
    status: "approuve",
    validUntil: "2027-03-26",
    returnOn: "2027-03-20",
    passportExpires: "2027-03-25",
    passportNumber: PASSPORT,
    estaPassportLast3: "567",
  });
  assert.ok(beforeEsta.includes("passeport_expire_avant_esta"));
  assert.equal(estaCoversTrip("approuve", beforeEsta), false);
});

test("ESTA inachevé, étape 4 sur 7, jamais payé", () => {
  const alerts = estaAlerts({ status: "inacheve", returnOn: "2027-04-02", passportExpires: "2028-01-01" });
  assert.deepEqual(alerts, []);
  assert.equal(estaBadge({ status: "inacheve", alerts }).label, "Inachevé");
  const draft = estaClientDraft({ status: "inacheve", alerts, reference: "TB-2026-0099" });
  assert.match(draft?.text || "", /manquant ou inachevé/);
  assert.match(draft?.text || "", new RegExp(ESTA_APPLY_URL.replace(/\./g, "\\.")));
  assert.match(draft?.text || "", /72 h avant le départ/);
  assert.doesNotMatch(draft?.text || "", /étape 4/);
  assert.equal(estaNoteCaption("étape 4 sur 7, jamais payé"), "étape 4 sur 7, jamais payé");
  assert.doesNotMatch(estaNoteCaption(`passeport ${PASSPORT}`, [PASSPORT]) || "", new RegExp(PASSPORT));
});

test("ESTA approuvé jusqu’au 29/08/2027", () => {
  const alerts = estaAlerts({
    status: "approuve",
    validUntil: "2027-08-29",
    returnOn: "2026-11-02",
    passportExpires: "2028-06-01",
    passportNumber: PASSPORT,
    estaPassportLast3: "567",
  });
  assert.equal(estaCoversTrip("approuve", alerts), true);
  assert.equal(estaBadge({ status: "approuve", validUntil: "2027-08-29", alerts }).label, "Valable jusqu’au 29/08/2027");
  const draft = estaClientDraft({ status: "approuve", validUntil: "2027-08-29", alerts, reference: "TB-2026-0042" });
  assert.match(draft?.text || "", /valable jusqu’au 29\/08\/2027/);
  assert.equal(estaAgencyDraft({
    reference: "TB-2026-0042",
    travelerName: "Camille Martin",
    status: "approuve",
    validUntil: "2027-08-29",
    alerts,
    href: "https://travelba.fr/admin/reservations/x",
  }).kind, "valable");
});

test("un ESTA lié à un autre passeport est une alerte", () => {
  const alerts = estaAlerts({
    status: "approuve",
    validUntil: "2027-08-29",
    returnOn: "2026-11-02",
    passportExpires: "2028-06-01",
    passportNumber: PASSPORT,
    estaPassportLast3: "000",
  });
  assert.ok(alerts.includes("ancien_passeport"));
  assert.equal(estaBadge({ status: "approuve", validUntil: "2027-08-29", alerts }).label, "Lié à un ancien passeport");
  const draft = estaClientDraft({ status: "approuve", validUntil: "2027-08-29", alerts });
  assert.match(draft?.text || "", /ancien passeport/);
  assert.match(draft?.text || "", /esta\.cbp\.dhs\.gov/);
  assert.doesNotMatch(draft?.text || "", new RegExp(PASSPORT));
});

test("le corps du webhook ne contient aucun champ passeport", () => {
  const body = estaWebhookBody({
    id: "check-1",
    bookingId: "booking-1",
    travelerId: "traveler-1",
    departureDate: "2026-11-01T08:00:00Z",
  });
  assert.deepEqual(Object.keys(body).sort(), ["booking_id", "departure_date", "id", "kind", "traveler_id"]);
  assert.equal(body.kind, "esta");
  assert.equal(body.departure_date, "2026-11-01");
  const json = JSON.stringify(body);
  assert.doesNotMatch(json, /passport|passeport|mrz|birth|naissance|12AB34567/i);
  assert.equal(JSON.parse(json).passport_number, undefined);
  const header = estaWebhookHeader("secret-key", null);
  assert.equal(header.name, "Authorization");
  assert.equal(header.value, "Bearer secret-key");
  const custom = estaWebhookHeader("secret-key", "X-Esta-Key");
  assert.equal(custom.name, "X-Esta-Key");
  assert.equal(custom.value, "secret-key");
  assert.doesNotMatch(JSON.stringify(header), /12AB|mrz/i);
});

test("un seul envoi par changement, puis un nouvel envoi si le passeport change", () => {
  const first = planEstaCheck({
    tripNeedsEsta: true,
    passport: { id: "doc-1", nationality: "FR" },
    previous: null,
  });
  assert.equal(first?.dispatchKey, "auto:doc-1");
  assert.equal(first?.status, "a_verifier");
  const again = planEstaCheck({
    tripNeedsEsta: true,
    passport: { id: "doc-1", nationality: "FR" },
    previous: { status: "a_verifier", documentId: "doc-1", dispatchKey: "auto:doc-1" },
  });
  assert.equal(again?.dispatchKey, "auto:doc-1");
  assert.equal(
    estaDispatchDue({
      desiredKey: again?.dispatchKey || null,
      storedKey: "auto:doc-1",
      dispatchedAt: "2026-10-06T10:00:00Z",
      nowMs: NOW,
    }),
    false
  );
  const changed = planEstaCheck({
    tripNeedsEsta: true,
    passport: { id: "doc-2", nationality: "FR" },
    previous: { status: "approuve", documentId: "doc-1", dispatchKey: "auto:doc-1" },
  });
  assert.equal(changed?.status, "a_verifier");
  assert.equal(changed?.clearResult, true);
  assert.equal(changed?.dispatchKey, "auto:doc-2");
  assert.equal(
    estaDispatchDue({ desiredKey: "auto:doc-2", storedKey: "auto:doc-1", dispatchedAt: "2026-10-06T10:00:00Z", nowMs: NOW }),
    true
  );
  const click = planEstaCheck({
    tripNeedsEsta: true,
    passport: { id: "doc-1", nationality: "FR" },
    previous: { status: "approuve", documentId: "doc-1", dispatchKey: "auto:doc-1" },
    manualStamp: "2026-10-06T12:00:00.000Z",
  });
  assert.equal(click?.dispatchKey, "manual:2026-10-06T12:00:00.000Z");
  const kept = planEstaCheck({
    tripNeedsEsta: true,
    passport: { id: "doc-1", nationality: "FR" },
    previous: { status: "approuve", documentId: "doc-1", dispatchKey: "auto:doc-1" },
  });
  assert.equal(kept, null);
});

test("la file quotidienne reprend les cas demandés, dans les 90 jours", () => {
  const base = {
    departure: "2026-12-01",
    today: "2026-10-06",
    returnOn: "2026-12-15",
    passportNumber: PASSPORT,
    nowMs: NOW,
  };
  assert.equal(estaOnDailyList({ ...base, status: "a_verifier", checkedAt: null }), true);
  assert.equal(estaOnDailyList({ ...base, status: "a_verifier", checkedAt: "2026-10-06T11:50:00Z" }), true);
  assert.equal(
    estaOnDailyList({ ...base, status: "introuvable", checkedAt: "2026-10-05T12:00:00Z" }),
    false
  );
  assert.equal(
    estaOnDailyList({ ...base, status: "introuvable", checkedAt: "2026-09-01T12:00:00Z" }),
    true
  );
  assert.equal(
    estaOnDailyList({
      ...base,
      status: "approuve",
      checkedAt: "2026-10-05T12:00:00Z",
      validUntil: "2026-12-10",
      estaPassportLast3: "567",
    }),
    true
  );
  assert.equal(
    estaOnDailyList({
      ...base,
      status: "approuve",
      checkedAt: "2026-10-05T12:00:00Z",
      validUntil: "2027-08-29",
      estaPassportLast3: "000",
    }),
    true
  );
  assert.equal(
    estaOnDailyList({
      ...base,
      status: "approuve",
      checkedAt: "2026-10-05T12:00:00Z",
      validUntil: "2027-08-29",
      estaPassportLast3: "567",
    }),
    false
  );
  assert.equal(estaOnDailyList({ ...base, departure: "2027-02-01", status: "a_verifier", checkedAt: null }), false);
  assert.equal(estaOnDailyList({ ...base, status: "non_concerne", checkedAt: null }), false);
});

test("aucun e-mail ne laisse un numéro de passeport en clair", () => {
  const masked = maskPassportInText(`Passeport ${PASSPORT} et ${PASSPORT.slice(0, 2)} ${PASSPORT.slice(2)}`, [PASSPORT]);
  assert.equal(maskPassportNumber(PASSPORT), "••••••567");
  assert.match(masked, /567/);
  assert.doesNotMatch(masked, /12AB34567/);
  assert.doesNotMatch(masked, /12AB 34567/);
  const agency = estaAgencyDraft({
    reference: "TB-2026-0042",
    travelerName: "Camille Martin",
    status: "inacheve",
    alerts: [],
    href: "https://travelba.fr/admin/reservations/x",
  });
  assert.equal(agency.kind, "alerte");
  assert.doesNotMatch(agency.text, /12AB|mrz|naissance/i);
});
