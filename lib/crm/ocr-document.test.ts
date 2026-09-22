import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zodSchema } from "ai";
import { identityExtractSchema } from "./ocr-schema";
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
