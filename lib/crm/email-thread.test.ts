import assert from "node:assert/strict";
import test from "node:test";
import { collapseInboxRows, countInboxCards, inboxGroupKey, openThreadParent, type ThreadRow } from "./email-thread";

const thread = "thread-milano";

test("un fil Four Seasons rejeté plusieurs fois ne fait qu’une carte", () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    id: `m${index}`,
    gmail_thread_id: thread,
    subject: `Four Seasons Milano ${index}`,
    received_at: `2026-06-0${index + 1}T10:00:00Z`,
    status: "matched",
  }));
  const groups = collapseInboxRows(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].members.length, 6);
  assert.equal(groups[0].primary.id, "m5");
  assert.equal(countInboxCards(rows), 1);
  assert.equal(inboxGroupKey(rows[0]), `thread:${thread}`);
});

test("la même confirmation, même sans fil commun, est un seul élément", () => {
  const little = [
    { id: "a", subject: "A", received_at: "2026-07-01", confirmation_refs: ["64570SH046795"] },
    { id: "b", subject: "B", received_at: "2026-07-02", extract: { items: [{ confirmation_ref: "64570" }] } },
  ];
  assert.equal(collapseInboxRows(little).length, 1);
  const shared = [
    { id: "a", received_at: "2026-07-01", confirmation_refs: ["AB12CD"] },
    { id: "b", received_at: "2026-07-02", confirmation_refs: ["AB12CD"] },
  ];
  assert.equal(collapseInboxRows(shared).length, 1);
  const distinct = [
    { id: "a", received_at: "2026-07-01", confirmation_refs: ["AB12CD"] },
    { id: "b", received_at: "2026-07-02", confirmation_refs: ["ZX98YU"] },
  ];
    assert.equal(collapseInboxRows(distinct).length, 2);
});

test("deux billets du même PNR, deux passagers, restent deux mails", () => {
  const raphael = {
    id: "raphael",
    gmail_thread_id: "t-raphael",
    subject: "Votre reçu de billet électronique : BOUKRIS/RAPHAEL 13APR2027 NICE DUBAI",
    received_at: "2026-11-16T14:38:45Z",
    confirmation_refs: ["zu5tco", "kdp4as"],
    extract: { items: [{ kind: "flight", confirmation_ref: "ZU5TCO" }], travelers: [{ first_name: "Raphael", last_name: "Boukris" }] },
  };
  const elon = {
    id: "elon",
    gmail_thread_id: "t-elon",
    subject: "Votre reçu de billet électronique : BOUKRIS/ELON 13APR2027 NICE DUBAI",
    received_at: "2026-11-16T14:38:45Z",
    confirmation_refs: ["zu5tco", "kdp4as"],
    extract: { items: [{ kind: "flight", confirmation_ref: "ZU5TCO" }], travelers: [{ first_name: "Elon", last_name: "Boukris" }] },
  };
  assert.equal(collapseInboxRows([raphael, elon]).length, 2);
  assert.equal(openThreadParent(elon, [raphael]), null);
});

test("un message nouveau rejoint le parent du fil, il n’ouvre pas une septième ligne", () => {
  const open = [
    { id: "first", gmail_thread_id: thread, received_at: "2026-06-01" },
    { id: "second", gmail_thread_id: thread, received_at: "2026-06-02" },
  ];
  const incoming = { id: "third", gmail_thread_id: thread, received_at: "2026-06-03" };
  assert.equal(openThreadParent(incoming, open)?.id, "first");
  const alone: ThreadRow = { id: "alone", gmail_thread_id: null, received_at: "2026-06-03" };
  assert.equal(openThreadParent(alone, open), null);
});
