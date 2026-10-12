import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { emptyIdentity } from "./passport-extract";
import {
  applyMisreadCorrection,
  misreadDraftFrom,
  misreadHasSignal,
  misreadPrompt,
  misreadRecord,
  misreadSymptom,
  scrubMisreadNote,
} from "./passport-misread";
import { createPassportFixAgent } from "./passport-misread-run";

test("un échange nom et prénoms se décrit sans les noms", () => {
  const symptom = misreadSymptom(
    { issuing_country: "IL", last_name: "Cohen", first_name: "Moshe David", number: "31234567" },
    { last_name: "Moshe David", first_name: "Cohen", personal_number: "3-1234567-8" }
  );
  assert.equal(symptom.issuing_country, "IL");
  assert.deepEqual(symptom.fields, ["last_name", "first_name"]);
  assert.deepEqual(symptom.patterns, ["surname_given_swapped"]);
  const dumped = JSON.stringify(symptom);
  assert.equal(dumped.includes("Cohen"), false);
  assert.equal(dumped.includes("Moshe"), false);
  assert.equal(dumped.includes("31234567"), false);
});

test("des prénoms retournés ne recopient pas la ligne", () => {
  const symptom = misreadSymptom(
    { last_name: "Dupont", first_name: "Maelle Louise Rosalie" },
    { last_name: "Dupont", first_name: "Rosalie Louise Maelle" }
  );
  assert.deepEqual(symptom.fields, ["first_name"]);
  assert.deepEqual(symptom.patterns, ["given_reversed"]);
  assert.equal(JSON.stringify(symptom).includes("Maelle"), false);
});

test("un champ vidé et une note chiffrée ne gardent pas la pièce", () => {
  const symptom = misreadSymptom({ authority: "Préfecture de Paris" }, { authority: "" });
  assert.deepEqual(symptom.patterns, ["cleared"]);
  const note = scrubMisreadNote(
    "le nom est inversé PPISRCOHEN<<MOSHE<DAVID<<<<<<<<<<<<<<<<<<<< 312345678"
  );
  assert.equal(note, "le nom est inversé");
  assert.doesNotMatch(note || "", /COHEN|312345678|</);
  const record = misreadRecord({
    staffId: "staff",
    customerId: null,
    read: { last_name: "Cohen", first_name: "Moshe David", number: "31234567" },
    corrected: { last_name: "Levy", first_name: "Moshe David" },
    note: "voir 31234567",
  });
  const dumped = JSON.stringify(record);
  assert.equal(dumped.includes("Cohen"), false);
  assert.equal(dumped.includes("Levy"), false);
  assert.equal(dumped.includes("31234567"), false);
  assert.equal(record.note, "voir");
  assert.equal(record.status, "noted");
  assert.equal(misreadHasSignal(record), true);
});

test("la correction affichée garde le numéro déjà lu", () => {
  const draft = misreadDraftFrom({ last_name: "Levy", first_name: "David" });
  draft.last_name = "Levy";
  const next = applyMisreadCorrection(
    { ...emptyIdentity(), number: "31234567", last_name: "Cohen", first_name: "Moshe" },
    draft
  );
  assert.equal(next.number, "31234567");
  assert.equal(next.last_name, "Levy");
  assert.equal(next.first_name, "David");
});

test("la demande Cursor n’envoie ni photo ni numéro", async () => {
  let body = "";
  let auth = "";
  const result = await createPassportFixAgent({
    symptom: {
      issuing_country: "IL",
      fields: ["last_name", "first_name"],
      patterns: ["surname_given_swapped"],
    },
    note: "le nom et les prénoms",
    apiKey: "cursor_test",
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.cursor.com/v1/agents");
      body = String(init?.body);
      auth = String((init?.headers as Record<string, string>).Authorization);
      return new Response(JSON.stringify({ agent: { id: "bc-11111111-1111-4111-8111-111111111111" } }), {
        status: 200,
      });
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.match(result.agentId, /^bc-/);
  assert.match(body, /github.com\/travelba\/travelba/);
  assert.match(body, /"startingRef":"main"/);
  assert.match(body, /"autoCreatePR":true/);
  assert.equal(body.includes("image"), false);
  assert.equal(body.includes("cursor_test"), false);
  assert.doesNotMatch(body, /COHEN|MOSHE|\d{6}/);
  assert.match(auth, /^Basic /);
  const missing = await createPassportFixAgent({
    symptom: { issuing_country: null, fields: [], patterns: [] },
    note: null,
    apiKey: "",
    fetchImpl: async () => {
      throw new Error("ne doit pas partir");
    },
  });
  assert.deepEqual(missing, { ok: false, reason: "missing_key" });
  const prompt = misreadPrompt(
    { issuing_country: "IL", fields: ["last_name"], patterns: ["changed"] },
    "le nom est inversé"
  );
  assert.match(prompt, /Ne la fusionne pas/);
  assert.equal(prompt.includes("31234567"), false);
});

test("la route et l’écran réservent Mal lu à l’agence", () => {
  const route = readFileSync(
    join(process.cwd(), "app/api/admin/travel-documents/misread/route.ts"),
    "utf8"
  );
  assert.match(route, /requireStaff/);
  assert.match(route, /misreadRecord/);
  assert.match(route, /createPassportFixAgent/);
  assert.doesNotMatch(route, /formData|storage_path|mrz_text/);
  const card = readFileSync(join(process.cwd(), "components/crm/PersonPassportCard.tsx"), "utf8");
  assert.match(card, /Mal lu/);
  assert.match(card, /variant === "admin"/);
  assert.match(card, /\/api\/admin\/travel-documents\/misread/);
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261012130000_passport_misreads.sql"),
    "utf8"
  );
  assert.match(sql, /crm_private\.is_staff\(\)/);
  assert.doesNotMatch(sql, /number|mrz|storage_path/);
});
