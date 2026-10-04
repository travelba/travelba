import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { EMAIL_INBOX_QUEUE_STATUSES } from "./types";

const ingest = readFileSync(new URL("./email-ingest.ts", import.meta.url), "utf8");

const createRun = readFileSync(new URL("./email-ingest-create-run.ts", import.meta.url), "utf8");

describe("pas de rattachement autonome", () => {
  it("email-ingest ne rattache pas et n’annule pas", () => {
    for (const name of [
      "executeEmailIngestDecision",
      "applyExtractToBooking",
      "persistNewBookingFromExtract",
      "applyCancellationToBooking",
      "autoApplyEmailIngest",
      "createCustomerFromExtract",
      "inviteCustomer",
    ]) {
      assert.equal(ingest.includes(name), false, name);
    }
  });

  it("la création automatique ne part que sur un mail reçu, pas au rematch", () => {
    const mentions = ingest.split("autoCreateBookingFromIngestId").length - 1;
    assert.equal(mentions, 2);
    assert.match(ingest, /await matchAndStoreExtract\([\s\S]*?await autoCreateBookingFromIngestId\(row\.id\)/);
    const rematchStart = ingest.indexOf("export async function rematchEmailIngestRow");
    const rematchEnd = ingest.indexOf("async function storeAttachment");
    const rematch = ingest.slice(rematchStart, rematchEnd);
    assert.match(rematch, /rematchStoredEmailIngest/);
    assert.equal(rematch.includes("autoCreateBookingFromIngestId"), false);
  });

  it("le geste automatique crée un brouillon caché, sans invitation ni rattachement", () => {
    for (const name of [
      "applyExtractToBooking",
      "applyCancellationToBooking",
      "inviteCustomer",
      "visibleToClient: true",
    ]) {
      assert.equal(createRun.includes(name), false, name);
    }
    assert.match(createRun, /visibleToClient:\s*false/);
    assert.match(createRun, /status:\s*"draft"/);
    assert.match(createRun, /notes_internal:\s*IMPORT_AUTO_NOTE,\s*status:\s*"draft"/);
    assert.match(createRun, /IMPORT_AUTO_NOTE/);
  });

  it("la file garde les mails non traités, y compris reçus et en erreur", () => {
    assert.deepEqual(EMAIL_INBOX_QUEUE_STATUSES, ["received", "parsed", "matched", "error"]);
  });
});
