import assert from "node:assert/strict";
import test from "node:test";
import { mcpWriteJournalDraft } from "./mcp-journal";

const DOSSIER = "11111111-1111-4111-8111-111111111111";

test("une écriture de clé nominative est au nom du membre sur le dossier", () => {
  const row = mcpWriteJournalDraft("creer_dossier", { dossier_id: DOSSIER }, "Raphael");
  assert.equal(row.action, "create");
  assert.equal(row.entityType, "dossier");
  assert.equal(row.entityId, DOSSIER);
  assert.equal(row.summary, "Dossier créé par Raphael.");
  const money = mcpWriteJournalDraft("crediter_revolut", {}, "Raphael");
  assert.equal(money.entityType, "finance");
  assert.match(money.summary, /par Raphael/);
  assert.equal(JSON.stringify(row).includes("tbk_"), false);
  const facture = mcpWriteJournalDraft("envoyer_facture", { dossier_id: DOSSIER }, "Raphael");
  assert.equal(facture.action, "send");
  assert.equal(facture.entityType, "dossier");
  assert.match(facture.summary, /Facture envoyée par Raphael/);
  const removed = mcpWriteJournalDraft("supprimer_client", {}, "Raphael");
  assert.equal(removed.action, "delete");
  assert.match(removed.summary, /Client supprimé/);
});
