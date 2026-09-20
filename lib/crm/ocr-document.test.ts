import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zodSchema } from "ai";
import { identityExtractSchema } from "./ocr-schema";

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
