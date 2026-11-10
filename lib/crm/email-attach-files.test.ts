import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  attachmentSha256,
  bookingDocumentKind,
  emailDepositMessage,
  isDepositableAttachment,
  mailBodyFile,
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

  it("un mail sans fichier joint dépose le texte de la confirmation", () => {
    const file = mailBodyFile({
      subject: "TR: Confirmation de réservation Transavia: ZZ9ZZ9",
      text: `${"Paris Tel Aviv ".repeat(8)}Numéro de réservation ZZ9ZZ9`,
      html: "<p>ignoré car le texte suffit</p>",
    });
    assert.ok(file);
    assert.equal(file?.name, "Confirmation de reservation Transavia ZZ9ZZ9.txt");
    assert.equal(file?.mime, "text/plain");
    assert.match(file?.text || "", /ZZ9ZZ9/);
    assert.equal(file?.text.includes("ignoré"), false);
    assert.equal(mailBodyFile({ subject: "TR: Court", text: "Bonjour", html: "<p>ok</p>" }), null);
    const fromHtml = mailBodyFile({
      subject: "Re: Fwd: confirmation",
      text: "",
      html: `<div>${"Vol Transavia ".repeat(12)}</div>`,
    });
    assert.match(fromHtml?.name || "", /^confirmation\.txt$/);
    assert.match(fromHtml?.text || "", /Vol Transavia/);
  });

  it("le texte du mail a son propre message, une devise vide ne change rien", () => {
    assert.match(
      emailDepositMessage({ added: 1, skipped: 0, empty: false, fromBody: true }, true),
      /La confirmation du mail est déposée sur la carte de la réservation/
    );
    assert.match(
      emailDepositMessage({ added: 1, skipped: 0, empty: false, fromBody: true }, true),
      /Aucune étape n’a été créée ni modifiée/
    );
    assert.match(
      emailDepositMessage({ added: 1, skipped: 0, empty: false }, false),
      /Une pièce est déposée sur le dossier/
    );
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
    assert.match(block, /body_text/);
    const inbox = readFileSync(new URL("../../components/admin/EmailIngestInbox.tsx", import.meta.url), "utf8");
    assert.match(inbox, /aria-live="assertive"/);
    assert.match(inbox, /rowNotice\[row\.id\]/);
    assert.equal(/applyIngestCards|applyReplacementToBooking|applyCancellationToBooking|upsertItems/.test(block), false);
  });

  it("mettre à jour les cartes dépose les pièces et n’en crée pas", () => {
    const start = route.indexOf('if (action === "apply_cards"');
    const end = route.indexOf('if (action === "new_booking")');
    const block = route.slice(start, end);
    assert.match(block, /resolveEmailCardId/);
    assert.match(block, /depositEmailAttachments/);
    assert.match(block, /body_text/);
    assert.equal(
      /applyIngestCards|applyReplacementToBooking|applyCancellationToBooking|upsertItems|persistNewBookingFromExtract/.test(block),
      false
    );
    const run = readFileSync(new URL("./email-attach-run.ts", import.meta.url), "utf8");
    assert.equal(run.includes("applyReplacementToBooking"), false);
    assert.equal(run.includes("applyCancellationToBooking"), false);
    assert.match(run, /matchEmailToCard/);
  });

  it("rattacher et mettre_a_jour déposent les pièces, sans créer de carte", () => {
    const start = mcp.indexOf("export async function settleEmail");
    const end = mcp.indexOf("export async function createClient");
    const fn = mcp.slice(start, end);
    assert.match(fn, /resolveEmailCardId/);
    assert.match(fn, /depositEmailAttachments/);
    assert.match(fn, /body_text/);
    assert.equal(/applyIngestCards|applyReplacementToBooking|applyCancellationToBooking/.test(fn), false);
    assert.match(fn, /cartes: false/);
    assert.equal(fn.includes("persistNewBookingFromExtract"), false);
    assert.equal(fn.includes("applyExtractToBooking"), false);
    assert.match(fn, /creer_dossier/);
  });
});
