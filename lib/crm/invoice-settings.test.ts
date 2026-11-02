import assert from "node:assert/strict";
import test from "node:test";
import { parseInvoiceSettings } from "./invoice-settings";

test("le réglage accepte un IBAN et un délai, et efface un champ vide", () => {
  const parsed = parseInvoiceSettings({
    iban: "fr76 3000 6000 0112 3456 7890 189",
    bic: "revofrp2",
    holder: "Travel Business Agency",
    due_days: "30",
  });
  assert.equal("error" in parsed, false);
  if ("error" in parsed) return;
  assert.equal(parsed.iban, "FR7630006000011234567890189");
  assert.equal(parsed.bic, "REVOFRP2");
  assert.equal(parsed.dueDays, 30);
  const cleared = parseInvoiceSettings({ iban: "  ", due_days: "" });
  assert.equal("error" in cleared, false);
  if ("error" in cleared) return;
  assert.equal(cleared.iban, null);
  assert.equal(cleared.dueDays, null);
});

test("un IBAN ou un délai illisible est refusé", () => {
  assert.equal("error" in parseInvoiceSettings({ iban: "123" }), true);
  assert.equal("error" in parseInvoiceSettings({ due_days: "400" }), true);
});
