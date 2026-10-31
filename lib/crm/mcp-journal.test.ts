import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { MCP_TOOL_JOURNAL, MCP_TOOLS_SELF_JOURNALED, mcpJournalLine } from "./mcp-journal";

const id = "11111111-1111-4111-8111-111111111111";

test("chaque outil MCP en écriture a une ligne d’Historique, sauf la lecture de carte déjà journalisée", () => {
  const source = readFileSync(join(process.cwd(), "lib/crm/mcp-registry.ts"), "utf8");
  const writes = [...source.matchAll(/\{\s*name:\s*"([a-z_]+)"([\s\S]*?)run:/g)]
    .filter((match) => /write:\s*true/.test(match[2]))
    .map((match) => match[1]);
  assert.ok(writes.length > 30);
  for (const tool of writes) {
    assert.ok(MCP_TOOL_JOURNAL[tool], `${tool} sans étiquette métier`);
  }
  assert.ok(MCP_TOOLS_SELF_JOURNALED.has("lire_carte_pliant"));
  assert.equal(mcpJournalLine({ tool: "lire_carte_pliant", write: false, actor: "grok", args: {}, result: {} }), null);
  assert.equal(mcpJournalLine({ tool: "fiche_dossier", write: false, actor: "grok", args: {}, result: {} }), null);
});

test("un crédit de virement : paiement reçu, montant, dossier, auteur le connecteur", () => {
  const line = mcpJournalLine({
    tool: "crediter_virement",
    write: true,
    actor: "grok",
    args: { customer_id: id, montant: 3200, dossier_id: id },
    result: { ok: true },
  });
  assert.ok(line);
  assert.equal(line.kind, "paiement_recu");
  assert.equal(line.amountCents, 320000);
  assert.equal(line.bookingId, id);
  assert.equal(line.actorLabel, "grok");
  assert.equal(line.sensitive, "payment");
  assert.equal(line.summary, "Virement crédité au client, 3\u00a0200\u00a0€ (connecteur).");
  assert.equal(line.cardLast4, null);
});

test("carte Pliant : plafond en montant, quatre chiffres seulement, blocage ou déblocage", () => {
  const issued = mcpJournalLine({
    tool: "creer_carte_pliant",
    write: true,
    actor: "cartes",
    args: { dossier_id: id, plafond: "2 450,00" },
    result: { derniers_chiffres: "4821", pan: "4242424242424242" },
  });
  assert.ok(issued);
  assert.equal(issued.kind, "carte_emise");
  assert.equal(issued.amountCents, 245000);
  assert.equal(issued.cardLast4, "4821");
  assert.doesNotMatch(JSON.stringify(issued), /4242424242424242/);
  const unlocked = mcpJournalLine({ tool: "bloquer_carte_pliant", write: true, actor: "cartes", args: { dossier_id: id, debloquer: true }, result: {} });
  assert.equal(unlocked?.kind, "carte_debloquee");
  const locked = mcpJournalLine({ tool: "bloquer_carte_pliant", write: true, actor: "cartes", args: { dossier_id: id }, result: {} });
  assert.equal(locked?.kind, "carte_bloquee");
});

test("traiter_email suit le geste : créer un dossier, déposer les pièces ; un outil inconnu reste « autre »", () => {
  assert.equal(mcpJournalLine({ tool: "traiter_email", write: true, actor: "grok", args: { action: "creer_dossier" }, result: { dossier_id: id } })?.kind, "dossier_cree");
  assert.equal(mcpJournalLine({ tool: "traiter_email", write: true, actor: "grok", args: { action: "rattacher" }, result: {} })?.kind, "piece_deposee");
  assert.equal(mcpJournalLine({ tool: "traiter_email", write: true, actor: "grok", args: { action: "classer" }, result: {} })?.kind, "dossier_modifie");
  const unknown = mcpJournalLine({ tool: "outil_futur", write: true, actor: "grok", args: {}, result: {} });
  assert.equal(unknown?.kind, "autre");
  assert.match(unknown?.summary || "", /outil_futur/);
  const confirmed = mcpJournalLine({ tool: "confirmer_service", write: true, actor: "grok", args: { dossier_id: id, carte_id: "x" }, result: { confirme: true, dossier_id: id } });
  assert.equal(confirmed?.kind, "option_levee");
  assert.equal(confirmed?.bookingId, id);
});
