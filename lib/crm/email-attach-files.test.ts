import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  attachmentSha256,
  bookingDocumentKind,
  emailDepositMessage,
  isDepositableAttachment,
  planEmailAttachmentCopies,
} from "./email-attach-files";

describe("dépôt des pièces", () => {
  it("ne copie qu’une fois la même empreinte, y compris si elle est déjà sur le dossier", () => {
    const plan = planEmailAttachmentCopies(
      [{ sha256: "aaa" }, { sha256: "bbb" }, { sha256: "aaa" }, { sha256: "" }],
      [{ sha256: "bbb" }, { sha256: null }]
    );
    assert.deepEqual(plan.copy, [0]);
    assert.deepEqual(plan.skipped, [1, 2, 3]);
  });

  it("laisse les images de signature et garde un PDF", () => {
    assert.equal(
      isDepositableAttachment({ name: "image001.png", mime: "image/png", size: 80_000 }),
      false
    );
    assert.equal(
      isDepositableAttachment({ name: "logo.png", mime: "image/png", size: 4_000 }),
      false
    );
    assert.equal(
      isDepositableAttachment({ name: "e-ticket.pdf", mime: "application/pdf", size: 120_000 }),
      true
    );
    assert.equal(bookingDocumentKind("e-ticket.pdf", "application/pdf"), "pdf");
  });

  it("un mail sans pièce utile se classe sans rien ajouter", () => {
    assert.match(emailDepositMessage({ added: 0, skipped: 0, empty: true }), /rien n’a été ajouté/);
    assert.match(emailDepositMessage({ added: 0, skipped: 2, empty: true }), /signature|déjà/);
    assert.match(emailDepositMessage({ added: 1, skipped: 1, empty: false }), /Une pièce est déposée/);
    assert.match(emailDepositMessage({ added: 2, skipped: 0, empty: false }), /Les cartes n’ont pas changé/);
  });

  it("l’empreinte suit les octets", () => {
    const a = attachmentSha256(new Uint8Array([1, 2, 3]));
    const b = attachmentSha256(new Uint8Array([1, 2, 3]));
    const c = attachmentSha256(new Uint8Array([1, 2, 4]));
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(a.length, 64);
  });
});

describe("le rattachement par défaut ne touche pas aux cartes", () => {
  const route = readFileSync(new URL("../../app/api/admin/email-ingest/[id]/route.ts", import.meta.url), "utf8");
  const mcp = readFileSync(new URL("./mcp-write.ts", import.meta.url), "utf8");

  it("le bouton Déposer les pièces ne passe pas par les cartes", () => {
    const start = route.indexOf('if (action === "attach_booking")');
    const end = route.indexOf('if (action === "apply_cards"');
    const block = route.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(block, /depositEmailAttachments/);
    assert.equal(/applyIngestCards|applyReplacementToBooking|applyCancellationToBooking|upsertItems/.test(block), false);
  });

  it("mettre à jour les cartes est un geste à part, et ne recopie pas les fichiers sans dédoublonnage", () => {
    const start = route.indexOf('if (action === "apply_cards"');
    const end = route.indexOf('if (action === "new_booking")');
    const block = route.slice(start, end);
    assert.match(block, /applyIngestCards/);
    assert.match(block, /depositEmailAttachments/);
    const run = readFileSync(new URL("./email-attach-run.ts", import.meta.url), "utf8");
    const apply = run.slice(
      run.indexOf("export async function applyIngestCards"),
      run.indexOf("export async function markEmailAttached")
    );
    assert.match(apply, /files: \[\]/);
    assert.equal(/upsertItems|attachBookingFiles/.test(apply), false);
  });

  it("rattacher dépose les pièces, mettre_a_jour est après", () => {
    const start = mcp.indexOf("export async function settleEmail");
    const end = mcp.indexOf("export async function createClient");
    const fn = mcp.slice(start, end);
    const rattacher = fn.slice(fn.indexOf('=== "rattacher"'), fn.indexOf('!== "mettre_a_jour"'));
    assert.match(rattacher, /depositEmailAttachments/);
    assert.equal(/applyIngestCards|applyReplacementToBooking|applyCancellationToBooking/.test(rattacher), false);
    const cards = fn.slice(fn.indexOf('!== "mettre_a_jour"'));
    assert.match(cards, /applyIngestCards/);
  });
});
