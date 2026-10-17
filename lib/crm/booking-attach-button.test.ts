import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");

test("joindre une pièce est un bouton visible, à côté d’Enregistrer", () => {
  assert.match(editor, /Joindre une pièce/);
  assert.match(editor, /\{saveButton\}\s*\{attachPieceButton\}/);
  assert.doesNotMatch(editor, /type="file"[^>]*className="text-sm"/);
  assert.match(editor, /className="sr-only"/);
  assert.match(editor, /shrink-0 rounded-full px-4 py-2 text-sm/);
});
