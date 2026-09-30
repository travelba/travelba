import assert from "node:assert/strict";
import { test } from "node:test";
import { WHATSAPP_IMAGE_KINDS } from "./concierge-notices";
import { isJpeg, loadWhatsappImage, whatsappImageKind } from "./whatsapp-images";

test("chaque illustration WhatsApp est un JPEG", async () => {
  assert.equal(whatsappImageKind("hotel.jpg"), "hotel");
  assert.equal(whatsappImageKind("hotel"), null);
  assert.equal(whatsappImageKind("../hotel.jpg"), null);
  for (const kind of WHATSAPP_IMAGE_KINDS) {
    const bytes = await loadWhatsappImage(kind);
    assert.ok(bytes, kind);
    assert.equal(isJpeg(bytes), true, kind);
  }
});
