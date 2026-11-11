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
    assert.equal(bookingDocumentKind("carte.pkpass", "application/vnd.apple.pkpass"), "carte d'embarquement");
    assert.equal(bookingDocumentKind("carte.pkpass", "application/octet-stream"), "carte d'embarquement");
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
    const end = route.indexOf('if (action === "preview_steps"');
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

  it("rattacher dépose les pièces, sans créer de carte", () => {
    const start = mcp.indexOf('if (action.action === "rattacher")');
    const end = mcp.indexOf("export async function createClient");
    const block = mcp.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(block, /depositEmailAttachments/);
    assert.match(block, /body_text/);
    assert.match(block, /cartes: false/);
    assert.equal(/applyReplacementToBooking|applyBookingSteps/.test(block), false);
  });

  it("mettre_a_jour montre l’aperçu et n’écrit qu’avec confirmer", () => {
    const start = mcp.indexOf('if (action.action === "mettre_a_jour")');
    const end = mcp.indexOf('if (action.action === "rattacher")');
    const block = mcp.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(block, /previewBookingSteps/);
    assert.match(block, /confirmer !== true/);
    assert.match(block, /applyBookingSteps/);
    assert.match(block, /ecrit: false/);
    assert.equal(block.includes("depositEmailAttachments"), false);
  });

  it("le bouton Mettre à jour les étapes confirme avant d’écrire", () => {
    const start = route.indexOf('if (action === "preview_steps"');
    const end = route.indexOf('if (action === "new_booking")');
    const block = route.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(block, /previewBookingSteps/);
    assert.match(block, /body\.confirmer !== true/);
    assert.match(block, /applyBookingSteps/);
    assert.equal(block.includes("depositEmailAttachments"), false);
    const inbox = readFileSync(new URL("../../components/admin/EmailIngestInbox.tsx", import.meta.url), "utf8");
    assert.match(inbox, /Mettre à jour les étapes/);
    assert.match(inbox, /Confirmer la mise à jour/);
    assert.match(inbox, /preview_steps/);
    assert.match(inbox, /update_steps/);
  });
});
