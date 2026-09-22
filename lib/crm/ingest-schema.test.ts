import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zodSchema } from "ai";
import { bookingExtractLlmSchema } from "./ingest-types";

describe("bookingExtractLlmSchema OpenAI strict", () => {
  it("met toutes les propriétés top-level dans required", async () => {
    const json = await zodSchema(bookingExtractLlmSchema).jsonSchema;
    const props = Object.keys(json.properties || {});
    assert.ok(props.length > 0, "properties expected");
    assert.ok(Array.isArray(json.required), `required missing: ${JSON.stringify(json)}`);
    const missing = props.filter((key) => !(json.required || []).includes(key));
    assert.deepEqual(missing, [], `missing from required: ${missing.join(", ")}`);
  });

  it("exige aussi les clés nested (details / travelers)", async () => {
    const json = await zodSchema(bookingExtractLlmSchema).jsonSchema;
    const item = (json.properties as { items?: { items?: Record<string, unknown> } })?.items
      ?.items as {
      required?: string[];
      properties?: { details?: { required?: string[] } };
    };
    assert.ok(item?.required?.includes("details"));
    assert.ok(item?.required?.includes("kind"));
    const details = item?.properties?.details;
    assert.ok(Array.isArray(details?.required));
    assert.ok(details?.required?.includes("source_file_name"));
    assert.ok(details?.required?.includes("included"));
    const traveler = (
      json.properties as { travelers?: { items?: { required?: string[] } } }
    )?.travelers?.items;
    assert.deepEqual([...(traveler?.required || [])].sort(), ["first_name", "last_name"]);
  });
});
