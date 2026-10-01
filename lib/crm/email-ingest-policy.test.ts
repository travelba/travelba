import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { EMAIL_INBOX_QUEUE_STATUSES } from "./types";

const ingest = readFileSync(new URL("./email-ingest.ts", import.meta.url), "utf8");

describe("pas de rattachement autonome", () => {
  it("email-ingest n’applique ni ne crée un dossier", () => {
    for (const name of [
      "executeEmailIngestDecision",
      "applyExtractToBooking",
      "persistNewBookingFromExtract",
      "applyCancellationToBooking",
      "autoApplyEmailIngest",
      "createCustomerFromExtract",
    ]) {
      assert.equal(ingest.includes(name), false, name);
    }
  });

  it("la file garde les mails non traités, y compris reçus et en erreur", () => {
    assert.deepEqual(EMAIL_INBOX_QUEUE_STATUSES, ["received", "parsed", "matched", "error"]);
  });
});
