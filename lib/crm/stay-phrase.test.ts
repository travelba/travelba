import assert from "node:assert/strict";
import test from "node:test";
import { planStayNotice, stayNoticeLine } from "./concierge-notices";
import { whatsappModifyHref } from "./carnet";
import { stayAtPhrase, stayDestinationPhrase } from "./stay-phrase";
import type { TripStep } from "./layover";

function flight(from: string, to: string, start: string, end: string, iataFrom = "", iataTo = ""): TripStep {
  return {
    kind: "flight",
    title: `${from} → ${to}`,
    start_at: start,
    end_at: end,
    details: {
      city_from: from,
      city_to: to,
      ...(iataFrom ? { from: iataFrom } : {}),
      ...(iataTo ? { to: iataTo } : {}),
    },
  };
}

const TEL_AVIV = [
  flight("Paris", "Tel Aviv", "2027-08-04T10:00:00", "2027-08-04T16:00:00", "CDG", "TLV"),
  flight("Tel Aviv", "Seychelles", "2027-08-11T09:00:00", "2027-08-11T18:00:00", "TLV", "SEZ"),
  flight("Seychelles", "Paris", "2027-08-25T20:00:00", "2027-08-26T06:00:00", "SEZ", "CDG"),
];

test("prépositions : ville, pays, archipel", () => {
  assert.equal(stayAtPhrase(["Tel Aviv"]), "à Tel Aviv");
  assert.equal(stayAtPhrase(["New York"]), "à New York");
  assert.equal(stayAtPhrase(["Seychelles"]), "aux Seychelles");
  assert.equal(stayAtPhrase(["Maldives"]), "aux Maldives");
  assert.equal(stayAtPhrase(["États-Unis"]), "aux États-Unis");
  assert.equal(stayAtPhrase(["Italie"]), "en Italie");
  assert.equal(stayAtPhrase(["Israël"]), "en Israël");
  assert.equal(stayAtPhrase(["Maroc"]), "au Maroc");
  assert.equal(stayAtPhrase(["Japon"]), "au Japon");
  assert.equal(stayAtPhrase(["Rome", "Milan", "Maroc"]), "à Rome, à Milan et au Maroc");
  assert.equal(stayAtPhrase(["Le Caire"]), "au Caire");
});

test("Paris → Tel Aviv → Seychelles → Paris : à Tel Aviv et aux Seychelles", () => {
  assert.equal(
    stayDestinationPhrase({
      destination: "Paris · Tel Aviv · Seychelles",
      title: "Paris · Tel Aviv · Seychelles",
    }),
    "à Tel Aviv et aux Seychelles"
  );
  assert.equal(
    stayDestinationPhrase({ destination: "Tel Aviv", title: "Tel Aviv", items: TEL_AVIV }),
    "à Tel Aviv et aux Seychelles"
  );
  const plan = planStayNotice({
    published: true,
    reference: "TB-2026-0092",
    destination: "Paris · Tel Aviv · Seychelles",
    title: "Paris · Tel Aviv · Seychelles",
    hasCover: false,
    items: TEL_AVIV,
  });
  assert.ok(plan);
  assert.equal(
    stayNoticeLine(plan.place, "TB-2026-0092"),
    "Votre séjour à Tel Aviv et aux Seychelles, réservation TB-2026-0092, est dans votre espace."
  );
  assert.match(plan.body, /Votre séjour à Tel Aviv et aux Seychelles, réservation TB-2026-0092, est dans votre espace\./);
  assert.equal(plan.body.includes("Paris"), false);
  assert.equal(plan.body.includes("à à"), false);
  const href = decodeURIComponent(
    whatsappModifyHref("33756841315", "TB-2026-0092", "Paris · Tel Aviv · Seychelles", { items: TEL_AVIV })
  );
  assert.match(href, /modifier TB-2026-0092 — Tel Aviv · Seychelles\./);
  assert.equal(href.includes("Paris"), false);
});

test("un nom choisi ne se mélange pas aux villes", () => {
  assert.equal(
    stayDestinationPhrase({ destination: "Tel Aviv · Seychelles", title: "40 ans" }),
    "à Tel Aviv et aux Seychelles"
  );
  assert.equal(stayDestinationPhrase({ destination: "Paris", title: "CDG" }), null);
});

test("aller simple vers Paris : à Paris", () => {
  const home = [
    flight("Lyon", "Paris", "2026-12-01T07:00:00", "2026-12-01T08:10:00"),
    {
      kind: "hotel",
      title: "Paris",
      start_at: "2026-12-01",
      end_at: "2026-12-04",
      details: { city: "Paris", hotel_name: "Paris" },
    },
  ];
  assert.equal(stayDestinationPhrase({ destination: "Lyon · Paris", title: "Paris", items: home }), "à Paris");
});
