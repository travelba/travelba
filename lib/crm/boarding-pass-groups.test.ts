import assert from "node:assert/strict";
import test from "node:test";
import {
  boardingSegmentLanded,
  boardingSegments,
  documentFlightId,
  groupBoardingPasses,
  type BoardingPassRef,
  type BoardingSegment,
} from "./boarding-pass-groups";

const NOW = new Date("2026-11-11T16:00:00Z");

function segment(partial: Partial<BoardingSegment> & Pick<BoardingSegment, "id" | "from" | "to" | "startAt">): BoardingSegment {
  return {
    endAt: null,
    airline: "Air France",
    number: "AF 1000",
    watchStatus: null,
    ...partial,
  };
}

function pass(partial: Partial<BoardingPassRef> & Pick<BoardingPassRef, "id" | "firstName">): BoardingPassRef {
  return { itemId: null, lastName: "", ...partial };
}

const travelers = [
  { firstName: "Camille", lastName: "Morel" },
  { firstName: "Inès", lastName: "Morel" },
  { firstName: "Louis", lastName: "Morel" },
  { firstName: "Jade", lastName: "Morel" },
];

test("un aller-retour classe les vols et les voyageurs dans le même ordre", () => {
  const aller = segment({
    id: "aller",
    from: "CDG",
    to: "NCE",
    airline: "Air France",
    number: "AF 1204",
    startAt: "2026-11-18T09:20:00",
    endAt: "2026-11-18T10:40:00",
  });
  const retour = segment({
    id: "retour",
    from: "NCE",
    to: "CDG",
    airline: "Air France",
    number: "AF 1205",
    startAt: "2026-11-22T18:40:00",
    endAt: "2026-11-22T20:05:00",
  });
  const names = ["Jade", "Louis", "Inès", "Camille"];
  const seats = ["21A", "21C", "21D", "21B"];
  const grouping = groupBoardingPasses({
    segments: [retour, aller],
    passes: [
      ...names.map((firstName, index) =>
        pass({ id: `aller-${firstName}`, itemId: "aller", firstName, lastName: "Morel", seat: seats[index] } as BoardingPassRef)
      ),
      ...[...names].reverse().map((firstName) =>
        pass({ id: `retour-${firstName}`, itemId: "retour", firstName, lastName: "Morel" })
      ),
    ],
    files: [
      { id: "pdf-retour", href: "/pdf/retour", label: "PDF complet · AF 1205", itemIds: ["retour"] },
      { id: "pdf-aller", href: "/pdf/aller", label: "PDF complet · AF 1204", itemIds: ["aller"] },
    ],
    travelers,
    now: NOW,
  });
  assert.deepEqual(
    grouping.upcoming.map((group) => [group.id, group.role, group.route, group.number, group.when]),
    [
      ["aller", "aller", "CDG → NCE", "AF 1204", "18 nov. · 09h20"],
      ["retour", "retour", "NCE → CDG", "AF 1205", "22 nov. · 18h40"],
    ]
  );
  assert.deepEqual(grouping.past, []);
  assert.equal(grouping.other, null);
  assert.deepEqual(
    grouping.upcoming[0]?.passes.map((row) => row.firstName),
    ["Camille", "Inès", "Louis", "Jade"]
  );
  assert.deepEqual(
    grouping.upcoming[1]?.passes.map((row) => row.firstName),
    ["Camille", "Inès", "Louis", "Jade"]
  );
  assert.equal(grouping.upcoming[0]?.files[0]?.label, "PDF complet · AF 1204");
  assert.equal(grouping.upcoming[1]?.files[0]?.href, "/pdf/retour");
});

test("une correspondance se distingue de l’aller et du retour", () => {
  const grouping = groupBoardingPasses({
    segments: [
      segment({
        id: "cdg-ams",
        from: "CDG",
        to: "AMS",
        airline: "KLM",
        number: "KL 1401",
        startAt: "2026-11-18T07:15:00",
        endAt: "2026-11-18T08:35:00",
      }),
      segment({
        id: "ams-jfk",
        from: "AMS",
        to: "JFK",
        airline: "KLM",
        number: "KL 641",
        startAt: "2026-11-18T10:05:00",
        endAt: "2026-11-18T12:20:00",
      }),
      segment({
        id: "jfk-cdg",
        from: "JFK",
        to: "CDG",
        airline: "KLM",
        number: "KL 642",
        startAt: "2026-11-25T16:40:00",
        endAt: "2026-11-26T05:50:00",
      }),
    ],
    passes: [
      pass({ id: "a", itemId: "cdg-ams", firstName: "Camille" }),
      pass({ id: "b", itemId: "ams-jfk", firstName: "Camille" }),
      pass({ id: "c", itemId: "jfk-cdg", firstName: "Camille" }),
      pass({ id: "loose", itemId: null, firstName: "Noah" }),
    ],
    now: NOW,
  });
  assert.deepEqual(
    grouping.upcoming.map((group) => [group.number, group.role, group.route]),
    [
      ["KL 1401", "aller", "CDG → AMS"],
      ["KL 641", "correspondance", "AMS → JFK"],
      ["KL 642", "retour", "JFK → CDG"],
    ]
  );
  assert.equal(grouping.other?.passes[0]?.firstName, "Noah");
  assert.equal(grouping.other?.passes.length, 1);
});

test("un aller simple avec correspondance ne reçoit pas d’aller ni de retour", () => {
  const grouping = groupBoardingPasses({
    segments: [
      segment({
        id: "out",
        from: "CDG",
        to: "AMS",
        number: "KL 1401",
        startAt: "2026-11-18T07:15:00",
        endAt: "2026-11-18T08:35:00",
      }),
      segment({
        id: "on",
        from: "AMS",
        to: "JFK",
        number: "KL 641",
        startAt: "2026-11-18T10:05:00",
        endAt: "2026-11-18T12:20:00",
      }),
    ],
    passes: [
      pass({ id: "a", itemId: "out", firstName: "Camille" }),
      pass({ id: "b", itemId: "on", firstName: "Camille" }),
    ],
    now: NOW,
  });
  assert.deepEqual(
    grouping.upcoming.map((group) => group.role),
    [null, "correspondance"]
  );
});

test("un retour dans la journée n’est pas une correspondance", () => {
  const grouping = groupBoardingPasses({
    segments: [
      segment({
        id: "matin",
        from: "CDG",
        to: "NCE",
        number: "AF 1204",
        startAt: "2026-11-18T08:00:00",
        endAt: "2026-11-18T09:20:00",
      }),
      segment({
        id: "soir",
        from: "NCE",
        to: "CDG",
        number: "AF 1205",
        startAt: "2026-11-18T18:00:00",
        endAt: "2026-11-18T19:25:00",
      }),
    ],
    passes: [
      pass({ id: "a", itemId: "matin", firstName: "Camille" }),
      pass({ id: "b", itemId: "soir", firstName: "Camille" }),
    ],
    now: NOW,
  });
  assert.deepEqual(
    grouping.upcoming.map((group) => group.role),
    ["aller", "retour"]
  );
});

test("sans codes IATA, aucun sens n’est inventé", () => {
  const grouping = groupBoardingPasses({
    segments: [
      segment({ id: "a", from: "", to: "", number: "AF 1", startAt: "2026-11-18T09:00:00", endAt: "2026-11-18T10:00:00" }),
      segment({ id: "b", from: "CDG", to: "", number: "AF 2", startAt: "2026-11-22T09:00:00", endAt: "2026-11-22T10:00:00" }),
    ],
    passes: [
      pass({ id: "1", itemId: "a", firstName: "Camille" }),
      pass({ id: "2", itemId: "b", firstName: "Camille" }),
    ],
    now: NOW,
  });
  assert.deepEqual(
    grouping.upcoming.map((group) => group.role),
    [null, null]
  );
  assert.equal(grouping.upcoming[0]?.route, "");
});

test("un vol déjà posé se range à part, un vol en l’air non", () => {
  const past = segment({
    id: "pose",
    from: "CDG",
    to: "NCE",
    number: "AF 1001",
    startAt: "2026-11-08T07:10:00",
    endAt: "2026-11-08T08:20:00",
  });
  const air = segment({
    id: "air",
    from: "NCE",
    to: "CDG",
    number: "AF 1002",
    startAt: "2026-11-11T12:00:00",
    endAt: "2026-11-11T13:20:00",
    watchStatus: "en_route",
  });
  const next = segment({
    id: "next",
    from: "CDG",
    to: "NCE",
    number: "AF 1003",
    startAt: "2026-11-18T09:20:00",
    endAt: "2026-11-18T10:40:00",
  });
  assert.equal(boardingSegmentLanded(past, NOW), true);
  assert.equal(boardingSegmentLanded({ ...air, watchStatus: "landed", endAt: "2026-11-18T10:00:00" }, NOW), true);
  assert.equal(boardingSegmentLanded(air, NOW), false);
  const grouping = groupBoardingPasses({
    segments: [past, air, next],
    passes: [
      pass({ id: "p", itemId: "pose", firstName: "Camille" }),
      pass({ id: "a", itemId: "air", firstName: "Camille" }),
      pass({ id: "n", itemId: "next", firstName: "Camille" }),
    ],
    now: NOW,
  });
  assert.deepEqual(
    grouping.upcoming.map((group) => group.id),
    ["air", "next"]
  );
  assert.deepEqual(
    grouping.past.map((group) => [group.id, group.role]),
    [["pose", "aller"]]
  );
  assert.equal(grouping.upcoming[0]?.role, "retour");
  assert.equal(grouping.upcoming[1]?.role, null);
});

test("un vol plus ancien vers une autre ville ne prend pas l’aller", () => {
  const grouping = groupBoardingPasses({
    segments: [
      segment({
        id: "lyon",
        from: "CDG",
        to: "LYS",
        number: "AF 1001",
        startAt: "2026-11-02T07:10:00",
        endAt: "2026-11-02T08:05:00",
      }),
      segment({
        id: "nice",
        from: "CDG",
        to: "NCE",
        number: "AF 1204",
        startAt: "2026-11-18T09:20:00",
        endAt: "2026-11-18T10:40:00",
      }),
      segment({
        id: "retour",
        from: "NCE",
        to: "CDG",
        number: "AF 1205",
        startAt: "2026-11-22T18:40:00",
        endAt: "2026-11-22T20:05:00",
      }),
    ],
    passes: [
      pass({ id: "a", itemId: "lyon", firstName: "Camille" }),
      pass({ id: "b", itemId: "nice", firstName: "Camille" }),
      pass({ id: "c", itemId: "retour", firstName: "Camille" }),
    ],
    now: NOW,
  });
  assert.deepEqual(
    [...grouping.past, ...grouping.upcoming].map((group) => [group.id, group.role]),
    [
      ["lyon", null],
      ["nice", "aller"],
      ["retour", "retour"],
    ]
  );
});

test("trois villes sans paire d’aéroports ne reçoivent ni aller ni retour", () => {
  const grouping = groupBoardingPasses({
    segments: [
      segment({ id: "nice", from: "CDG", to: "NCE", number: "AF 1", startAt: "2026-11-18T09:00:00", endAt: "2026-11-18T10:20:00" }),
      segment({ id: "rome", from: "NCE", to: "FCO", number: "AF 2", startAt: "2026-11-21T09:00:00", endAt: "2026-11-21T10:30:00" }),
      segment({ id: "paris", from: "FCO", to: "CDG", number: "AF 3", startAt: "2026-11-25T09:00:00", endAt: "2026-11-25T11:00:00" }),
    ],
    passes: [
      pass({ id: "a", itemId: "nice", firstName: "Camille" }),
      pass({ id: "b", itemId: "rome", firstName: "Camille" }),
      pass({ id: "c", itemId: "paris", firstName: "Camille" }),
    ],
    now: NOW,
  });
  assert.deepEqual(
    grouping.upcoming.map((group) => group.role),
    [null, null, null]
  );
});

test("le lien du dossier ou le passe Apple rattache la pièce, sinon elle reste libre", () => {
  const segments = boardingSegments([
    {
      id: "aller",
      kind: "flight",
      supplier: "Air France",
      start_at: "2026-11-18T09:20:00",
      end_at: "2026-11-18T10:40:00",
      visible_to_client: true,
      lifecycle: "active",
      details: { airline: "Air France", flight_number: "AF 1204", from: "CDG", to: "NCE" },
    },
    {
      id: "retour",
      kind: "flight",
      start_at: "2026-11-22T18:40:00",
      visible_to_client: false,
      lifecycle: "active",
      details: { flight_number: "AF 1205", from: "NCE", to: "CDG" },
    },
    {
      id: "hotel",
      kind: "hotel",
      start_at: "2026-11-18T15:00:00",
      details: {},
    },
  ]);
  assert.deepEqual(
    segments.map((row) => row.id),
    ["aller", "retour"]
  );
  const visible = boardingSegments(
    [
      {
        id: "aller",
        kind: "flight",
        visible_to_client: true,
        start_at: "2026-11-18T09:20:00",
        details: { flight_number: "AF 1204", from: "CDG", to: "NCE" },
      },
      {
        id: "retour",
        kind: "flight",
        visible_to_client: false,
        start_at: "2026-11-22T18:40:00",
        details: { flight_number: "AF 1205", from: "NCE", to: "CDG" },
      },
    ],
    { clientVisible: true }
  );
  assert.deepEqual(visible.map((row) => row.id), ["aller"]);
  assert.equal(documentFlightId({ booking_item_id: "aller" }, segments), "aller");
  assert.equal(
    documentFlightId({ extracted: { flight: "AF1205", firstName: "Camille" } }, segments),
    "retour"
  );
  assert.equal(documentFlightId({ extracted: { flight: "AF 9999" } }, segments), null);
  assert.equal(documentFlightId({}, segments), null);
});
