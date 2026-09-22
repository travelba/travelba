import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zodSchema } from "ai";
import { identityExtractSchema, identitiesExtractSchema } from "./ocr-schema";
import { isAllowedIngestType, isPdfFile } from "./ingest-types";

describe("identityExtractSchema OpenAI strict", () => {
  it("met toutes les propriétés dans required (pas d’optional)", async () => {
    const json = await zodSchema(identityExtractSchema).jsonSchema;
    const props = Object.keys(json.properties || {});
    assert.ok(props.length > 0);
    assert.ok(Array.isArray(json.required));
    assert.deepEqual([...(json.required || [])].sort(), [...props].sort());
    assert.ok(props.includes("doc_type"));
  });

  it("demande un tableau identities avec les mêmes champs required", async () => {
    const json = await zodSchema(identitiesExtractSchema).jsonSchema;
    assert.deepEqual(json.required, ["identities"]);
    const items = (json.properties?.identities as { items?: { required?: string[]; properties?: object } })?.items;
    assert.ok(items?.properties);
    assert.deepEqual([...(items.required || [])].sort(), Object.keys(items.properties).sort());
  });
});

describe("upload pièce d’identité", () => {
  it("accepte PDF même sans MIME application/pdf", () => {
    assert.equal(isPdfFile("application/pdf", "scan.jpg"), true);
    assert.equal(isPdfFile("", "passeport.pdf"), true);
    assert.equal(isPdfFile("application/octet-stream", "Passeport.PDF"), true);
    assert.equal(isAllowedIngestType("application/octet-stream", "passeport.pdf"), true);
    assert.equal(isAllowedIngestType("image/jpeg", "photo.jpg"), true);
    assert.equal(isAllowedIngestType("application/zip", "archive.zip"), false);
  });
});
