import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookingDesk } from "../../components/admin/booking-desk/BookingDesk";
import {
  BOOKING_VUES,
  DESK_SECTIONS,
  deskNextSteps,
  deskOpening,
  deskOrder,
  parseBookingVue,
  sectionHint,
  type DeskFacts,
  type DeskSectionId,
} from "./booking-desk";

const calm: DeskFacts = {
  published: true,
  pendingCards: 0,
  needsReview: false,
  travelers: 2,
  missingPassport: false,
  programCards: 4,
  documents: 1,
  hotelAttention: 0,
  hasFormalities: false,
  formalitiesOpen: false,
  amountLabel: "1\u202f200 \u20ac",
};

const available: DeskSectionId[] = [...DESK_SECTIONS];

test("trois présentations, avec un ordre différent", () => {
  assert.ok(BOOKING_VUES.length >= 3);
  assert.deepEqual(parseBookingVue("bureau"), "bureau");
  assert.equal(parseBookingVue("grille"), null);

  const bureau = deskOrder("bureau", available);
  const histoire = deskOrder("histoire", available);
  const tableau = deskOrder("tableau", available);
  assert.equal(bureau[0], "aujourd");
  assert.equal(bureau.at(-1), "dossier");
  assert.equal(histoire[0], "dossier");
  assert.equal(histoire.includes("aujourd"), false);
  assert.equal(tableau[0], "programme");
  assert.equal(tableau.includes("aujourd"), false);
  assert.notDeepEqual(bureau, histoire);
  assert.notDeepEqual(histoire, tableau);

  const withoutHotel = available.filter((id) => id !== "hotel");
  assert.equal(deskOrder("bureau", withoutHotel).includes("hotel"), false);
});

test("les étapes parlent d’abord de ce qui attend", () => {
  const empty = deskNextSteps({
    ...calm,
    published: false,
    travelers: 0,
    programCards: 0,
    missingPassport: false,
  });
  assert.equal(empty[0]?.tone, "wait");
  assert.equal(empty[0]?.section, "client");
  assert.ok(empty.some((step) => step.section === "programme" && step.title.includes("vide")));
  assert.ok(empty.some((step) => step.section === "voyageurs"));

  const quiet = deskNextSteps(calm);
  assert.equal(quiet.some((step) => step.tone === "wait"), false);
  assert.equal(sectionHint("client", calm), "Visible");
  assert.equal(sectionHint("programme", { ...calm, needsReview: true }), "4 étapes · à relire");
  assert.equal(sectionHint("voyageurs", { ...calm, travelers: 0 }), "Personne");
  assert.equal(deskOpening("tableau", { ...calm, programCards: 0 }, available), "programme");
  assert.equal(deskOpening("bureau", calm, available), "aujourd");
});

test("chaque présentation garde les sections dans son ordre", () => {
  const sections = Object.fromEntries(DESK_SECTIONS.filter((id) => id !== "aujourd").map((id) => [id, id])) as Record<
    Exclude<DeskSectionId, "aujourd">,
    string
  >;
  const identity = {
    reference: "TB-1",
    title: "Séjour à Avoriaz",
    destination: "Avoriaz",
    dates: "12–18 janvier",
    when: "J - 4",
    statusLabel: "Confirmée",
    clientName: "Camille Martin",
    published: false,
  };

  for (const vue of ["bureau", "histoire", "tableau"] as const) {
    const html = renderToStaticMarkup(
      createElement(BookingDesk, {
        vue,
        onVue: () => {},
        facts: { ...calm, published: false, programCards: 0 },
        identity,
        sections,
      })
    );
    assert.match(html, new RegExp(`data-view="${vue}"`));
    const order = deskOrder(
      vue,
      vue === "bureau" ? available : available.filter((id) => id !== "aujourd")
    );
    let at = -1;
    for (const id of order) {
      const mark = `data-section="${id}"`;
      const next = html.indexOf(mark);
      assert.ok(next > at, `${vue} ${id}`);
      at = next;
    }
  }
});
