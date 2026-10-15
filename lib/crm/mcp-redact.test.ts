import assert from "node:assert/strict";
import test from "node:test";
import { redactMcp } from "./mcp-redact";

test("mcp redact drops piece numbers, iban, tokens and signed urls", () => {
  const cleaned = redactMcp({
    nom: "Ada",
    number: "12AB34567",
    personal_number: "999",
    counterparty_iban: "FR7630006000011234567890189",
    access_token: "secret",
    lien: "/admin/clients/1",
    note: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig",
    fichier: "https://fsmfozxgujskluxakeoq.supabase.co/storage/v1/object/sign/crm-files/a.pdf?token=abc",
  }) as Record<string, unknown>;
  assert.equal(cleaned.nom, "Ada");
  assert.equal(cleaned.lien, "/admin/clients/1");
  assert.equal("number" in cleaned, false);
  assert.equal("personal_number" in cleaned, false);
  assert.equal("counterparty_iban" in cleaned, false);
  assert.equal("access_token" in cleaned, false);
  assert.equal(cleaned.note, "retiré");
  assert.equal(cleaned.fichier, "retiré");
});

test("piece numbers stay hidden except numero_piece on the passport tool", () => {
  const payload = {
    facture: { numero: "FAC-2026-1" },
    numero_piece: "X12345678",
    document_numero_piece: "Y87654321",
    number: "12AB34567",
    personal_number: "999",
  };
  const hidden = redactMcp(payload) as Record<string, unknown>;
  const shown = redactMcp(payload, 0, true) as Record<string, unknown>;
  assert.deepEqual((hidden.facture as { numero: string }).numero, "FAC-2026-1");
  assert.equal("numero_piece" in hidden, false);
  assert.equal("number" in hidden, false);
  assert.equal(shown.numero_piece, "X12345678");
  assert.equal("document_numero_piece" in shown, false);
  assert.equal("number" in shown, false);
  assert.equal("personal_number" in shown, false);
  assert.deepEqual((shown.facture as { numero: string }).numero, "FAC-2026-1");
});
